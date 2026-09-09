/**
 * digest.ts — Daily job digest orchestration
 *
 * This is the main entry point for the digest pipeline.
 * It replaces the old digest.mjs with a clean TypeScript implementation.
 *
 * Architecture:
 *   scan → dedup → evaluate → rank → ViewModel → render → send
 *
 * Usage:
 *   bun run src/digest.ts                          — preview to console
 *   bun run src/digest.ts --mode daily             — email digest
 *   bun run src/digest.ts --mock                   — use mock data
 */

import { resolve } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { load as yamlLoad } from "js-yaml";

// ─── Domain & Pipeline ────────────────────────────────────────
import type { Job } from "./domain/job.js";
import { createJobId } from "./domain/job.js";
import { loadEnv, hasCloudflareKeys } from "./config/env.js";
import { loadSearchConfig } from "./config/loader.js";
import { loadActiveProfile, getProfileTargetRoles } from "./lib/profile.js";
import { IST_OFFSET_HOURS, MS_PER_HOUR } from "./lib/constants.js";

// ─── Pipeline ─────────────────────────────────────────────────
import { scanJobs } from "./pipeline/scan.js";
import { deduplicateJobs, filterSeenJobs } from "./pipeline/dedup.js";
import { evaluateJobs } from "./pipeline/evaluate.js";
import { rankJobs, filterForDigest } from "./pipeline/rank.js";

// ─── Digest ───────────────────────────────────────────────────
import { buildViewModel } from "./digest/viewModel.js";
import { renderEmail, renderText } from "./digest/renderer.js";
import { sendEmail } from "./digest/mailer.js";

// ─── Paths ────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dir, "..");
const SEEN_PATH = resolve(ROOT, "data/digest-seen.json");

// ─── Args ─────────────────────────────────────────────────────

const args = process.argv.slice(2);

function argVal(name: string, fallback: string): string {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1 || idx === args.length - 1) return fallback;
    return args[idx + 1]!;
}

function argFlag(name: string): boolean {
    return args.includes(`--${name}`);
}

const MODE =
    argFlag("send") || argFlag("daily") ? "daily" : argVal("mode", "preview");
const MAX_JOBS = parseInt(argVal("max", "50"), 10) || 50;
const EVAL_TOP = parseInt(argVal("evaluate", "5"), 10) || 0;
const QUERY = argVal("query", "auto");
const MOCK_MODE = argFlag("mock");

// ─── Seen database (dedup) ────────────────────────────────────

function loadSeen(): Set<string> {
    try {
        if (existsSync(SEEN_PATH)) {
            const data = JSON.parse(readFileSync(SEEN_PATH, "utf-8"));
            return new Set(data.seen || []);
        }
    } catch (e) {
        console.warn(
            `Warning: Could not load seen jobs: ${(e as Error).message}`,
        );
    }
    return new Set();
}

function saveSeen(seen: Set<string>): void {
    mkdirSync(resolve(ROOT, "data"), { recursive: true });
    writeFileSync(
        SEEN_PATH,
        JSON.stringify(
            { seen: [...seen].sort(), updated: new Date().toISOString() },
            null,
            2,
        ),
    );
}

// ─── Main ─────────────────────────────────────────────────────

export async function main(
    args?: Record<string, string | boolean>,
): Promise<void> {
    // Load env
    const env = loadEnv();

    console.log(
        `Digest mode=${MODE} query="${QUERY}" max=${MAX_JOBS} evaluate=${hasCloudflareKeys(env) ? EVAL_TOP : 0} mock=${MOCK_MODE}`,
    );

    const searchConfig = loadSearchConfig();
    console.log(
        `Config: score_threshold=${searchConfig.score_threshold} max_per_digest=${searchConfig.max_per_digest} max_age_days=${searchConfig.max_age_days}`,
    );

    // Scan
    const scanResult = await scanJobs({ query: QUERY, mock: MOCK_MODE });
    const allJobs = scanResult.jobs;

    // Dedup against seen jobs
    const seen = loadSeen();
    const fresh = filterSeenJobs(allJobs, seen);
    console.log(`Scanned: ${allJobs.length} jobs | Fresh: ${fresh.length}`);

    // Evaluate top N jobs
    if (hasCloudflareKeys(env) && EVAL_TOP > 0) {
        await evaluateJobs(fresh, { concurrent: EVAL_TOP });
    }

    // Rank and filter
    const ranked = rankJobs(fresh, { minScore: searchConfig.score_threshold });
    const digestJobs = filterForDigest(ranked, searchConfig.max_per_digest);

    console.log(
        `Digest: ${digestJobs.length} scored jobs (unscored ${ranked.unscored.length} excluded from email)`,
    );

    if (digestJobs.length === 0) {
        console.log("No jobs met the score threshold. Digest skipped.");
        if (MODE === "daily") {
            for (const job of fresh) {
                seen.add(createJobId(job));
            }
            saveSeen(seen);
        }
        return;
    }

    // Mark jobs as seen
    if (MODE === "daily") {
        for (const job of fresh) {
            seen.add(createJobId(job));
        }
        saveSeen(seen);
    }

    // Build view model
    const now = new Date();
    const ist = new Date(now.getTime() + IST_OFFSET_HOURS * MS_PER_HOUR * 1000);
    const dateStr =
        ist.toISOString().replace("T", " ").substring(0, 16) + " IST";

    const viewModel = buildViewModel(digestJobs, {
        dateStr,
        totalScanned: allJobs.length,
        freshCount: fresh.length,
        unscoredCount: ranked.unscored.length,
    });

    // Generate subject
    const subject = (() => {
        const strong = viewModel.summary.strongMatches;
        const review = viewModel.summary.worthReviewing;
        if (strong > 0)
            return `JobOps: ${strong} strong match${strong > 1 ? "es" : ""} + ${review} to review`;
        if (review > 0)
            return `JobOps: ${review} job${review > 1 ? "s" : ""} worth reviewing`;
        return `JobOps: ${fresh.length} new jobs scanned`;
    })();

    // Render
    const reportsDir = resolve(ROOT, "reports");
    if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

    const html = renderEmail(viewModel);
    const text = renderText(viewModel);

    // Save full report (local only)
    const isCI = Boolean(process.env.CI);
    if (!isCI) {
        const fullReportFile = resolve(
            reportsDir,
            `digest-full-${ist.toISOString().split("T")[0]}.html`,
        );
        writeFileSync(fullReportFile, html);
        console.log(`Full report: ${fullReportFile}`);
    }

    // Send email
    const result = await sendEmail({ subject, text, html });
    const sent = result.sent;

    // Save digest
    const digestFile = resolve(
        reportsDir,
        `digest-${ist.toISOString().split("T")[0]}.md`,
    );
    writeFileSync(digestFile, `# JobOps Digest — ${dateStr}\n\n${text}\n`);
    console.log(`\nDigest saved to: ${digestFile}`);
    console.log(
        sent
            ? "Done."
            : "Preview only — configure RESEND_API_KEY or SMTP credentials to email.",
    );
}

main().catch((e) => {
    console.error(`Digest failed: ${(e as Error).message}`);
    process.exit(1);
});
