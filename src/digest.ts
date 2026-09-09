/**
 * digest.ts — Daily job digest orchestration
 *
 * Architecture:
 *   scan → dedup → evaluate → rank → ViewModel → render → send
 *
 * Behavior:
 *   - preview mode: prints digest to console, never writes digest-seen.json
 *   - daily mode: sends email, then writes fresh job IDs to digest-seen.json
 *   - if email delivery fails or credentials are absent, seen state is preserved
 *   - if no jobs meet the score threshold, digest-seen.json is unchanged
 *
 * Usage (CLI boundary):
 *   bun run src/cli/index.ts digest [--mode preview|daily] [--query "..."] [--max N] [--evaluate N] [--mock]
 */

import { resolve } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

// ─── Domain & Pipeline ────────────────────────────────────────
import { createJobId } from "./domain/job";
import { loadEnv, hasCloudflareKeys } from "./config/env";
import { loadSearchConfig } from "./config/loader";
import { IST_OFFSET_HOURS, MS_PER_HOUR } from "./lib/constants";

// ─── Pipeline ─────────────────────────────────────────────────
import { scanJobs } from "./pipeline/scan";
import { filterSeenJobs } from "./pipeline/dedup";
import { evaluateJobs } from "./pipeline/evaluate";
import { rankJobs, filterForDigest } from "./pipeline/rank";

// ─── Digest ───────────────────────────────────────────────────
import { buildViewModel } from "./digest/viewModel";
import { renderEmail, renderText } from "./digest/renderer";
import { sendEmail } from "./digest/mailer";

// ─── Paths ────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dir, "..");
const SEEN_PATH = resolve(ROOT, "data/digest-seen.json");

// ─── Types ────────────────────────────────────────────────────

export interface DigestOptions {
    mode: string;
    query: string;
    max: number;
    evaluate: number;
    mock: boolean;
}

export interface DigestResult {
    scanned: number;
    fresh: number;
    digestJobs: number;
    unscored: number;
    sent: boolean;
    provider?: "resend" | "smtp";
    mode: string;
}

// ─── Seen database (dedup) ────────────────────────────────────

export function loadSeen(root?: string): Set<string> {
    const seenPath = root ? resolve(root, "data/digest-seen.json") : SEEN_PATH;
    try {
        if (existsSync(seenPath)) {
            const data = JSON.parse(readFileSync(seenPath, "utf-8"));
            return new Set(data.seen || []);
        }
    } catch (e) {
        console.warn(
            `Warning: Could not load seen jobs: ${(e as Error).message}`,
        );
    }
    return new Set();
}

export function saveSeen(seen: Set<string>, root?: string): void {
    const seenPath = root ? resolve(root, "data/digest-seen.json") : SEEN_PATH;
    const dir = resolve(seenPath, "..");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
        seenPath,
        JSON.stringify(
            { seen: [...seen].sort(), updated: new Date().toISOString() },
            null,
            2,
        ),
    );
}

// ─── Args parsing ─────────────────────────────────────────────

export function parseDigestArgs(argv: string[]): DigestOptions {
    const args = argv.slice(2);

    function argVal(name: string, fallback: string): string {
        const idx = args.indexOf(`--${name}`);
        if (idx === -1 || idx === args.length - 1) return fallback;
        return args[idx + 1]!;
    }

    function argFlag(name: string): boolean {
        return args.includes(`--${name}`);
    }

    const mode =
        argFlag("send") || argFlag("daily")
            ? "daily"
            : argVal("mode", "preview");

    return {
        mode,
        query: argVal("query", "auto"),
        max: parseInt(argVal("max", "50"), 10) || 50,
        evaluate: parseInt(argVal("evaluate", "5"), 10) || 0,
        mock: argFlag("mock"),
    };
}

// ─── Main ─────────────────────────────────────────────────────

export async function main(
    options?: Record<string, string | boolean>,
    root?: string,
): Promise<DigestResult> {
    // Parse options: use provided options, or fall back to defaults
    const opts: DigestOptions = options
        ? {
              mode: String(options.mode || "preview"),
              query: String(options.query || "auto"),
              max: parseInt(String(options.max || "50"), 10) || 50,
              evaluate: parseInt(String(options.evaluate || "5"), 10) || 0,
              mock: Boolean(options.mock),
          }
        : { mode: "preview", query: "auto", max: 50, evaluate: 5, mock: false };

    // Load env
    const env = loadEnv(root);

    console.log(
        `Digest mode=${opts.mode} query="${opts.query}" max=${opts.max} evaluate=${hasCloudflareKeys(env) ? opts.evaluate : 0} mock=${opts.mock}`,
    );

    const searchConfig = loadSearchConfig();
    console.log(
        `Config: score_threshold=${searchConfig.score_threshold} max_per_digest=${searchConfig.max_per_digest} max_age_days=${searchConfig.max_age_days}`,
    );

    // Scan
    const scanResult = await scanJobs({ query: opts.query, mock: opts.mock });
    const allJobs = scanResult.jobs;

    // Dedup against seen jobs
    const seen = loadSeen(root);
    const fresh = filterSeenJobs(allJobs, seen);
    console.log(`Scanned: ${allJobs.length} jobs | Fresh: ${fresh.length}`);

    // Evaluate top N jobs
    if (hasCloudflareKeys(env) && opts.evaluate > 0) {
        await evaluateJobs(fresh, { concurrent: opts.evaluate });
    }

    // Rank and filter
    const ranked = rankJobs(fresh, { minScore: searchConfig.score_threshold });
    const digestJobs = filterForDigest(ranked, searchConfig.max_per_digest);

    console.log(
        `Digest: ${digestJobs.length} scored jobs (unscored ${ranked.unscored.length} excluded from email)`,
    );

    // ── No jobs meet threshold: preserve seen state, return early ──
    if (digestJobs.length === 0) {
        console.log("No jobs met the score threshold. Digest skipped.");
        return {
            scanned: allJobs.length,
            fresh: fresh.length,
            digestJobs: 0,
            unscored: ranked.unscored.length,
            sent: false,
            mode: opts.mode,
        };
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
    const reportsDir = resolve(root || ROOT, "reports");
    if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

    const html = renderEmail(viewModel);
    const text = renderText(viewModel);

    // Save full report (local only, not in CI)
    const isCI = Boolean(process.env.CI);
    if (!isCI) {
        const fullReportFile = resolve(
            reportsDir,
            `digest-full-${ist.toISOString().split("T")[0]}.html`,
        );
        writeFileSync(fullReportFile, html);
        console.log(`Full report: ${fullReportFile}`);
    }

    // ── Send email ──
    const result = await sendEmail({ subject, text, html });

    // ── Mark seen ONLY after successful delivery in daily mode ──
    // In preview mode, never write to digest-seen.json.
    // In daily mode, only write if email was sent successfully.
    if (opts.mode === "daily" && result.sent) {
        for (const job of fresh) {
            seen.add(createJobId(job));
        }
        saveSeen(seen, root);
        console.log(`Marked ${fresh.length} jobs as seen.`);
    } else if (opts.mode === "daily" && !result.sent) {
        console.log("Email not sent — preserving existing seen-job state.");
    }

    // Save digest markdown (always, for audit trail)
    const digestFile = resolve(
        reportsDir,
        `digest-${ist.toISOString().split("T")[0]}.md`,
    );
    writeFileSync(digestFile, `# JobOps Digest — ${dateStr}\n\n${text}\n`);
    console.log(`\nDigest saved to: ${digestFile}`);
    console.log(
        result.sent
            ? "Done."
            : "Preview only — configure RESEND_API_KEY or SMTP credentials to email.",
    );

    return {
        scanned: allJobs.length,
        fresh: fresh.length,
        digestJobs: digestJobs.length,
        unscored: ranked.unscored.length,
        sent: result.sent,
        provider: result.provider,
        mode: opts.mode,
    };
}
