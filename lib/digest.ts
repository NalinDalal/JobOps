/**
 * lib/digest.ts — Daily job digest orchestration
 *
 * Architecture:
 *   scan → dedup → evaluate → rank → ViewModel → render → send
 *
 * Behavior:
 *   - preview mode: prints digest to console, never writes digest-seen.json
 *   - daily mode: sends email, then writes fresh job IDs to digest-seen.json
 *   - if email delivery fails or credentials are absent, seen state is preserved
 *   - if no jobs meet the score threshold, digest-seen.json is unchanged
 */

import { resolve } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import type { DigestOptions, DigestResult, Job } from "./types";
import { createJobId } from "./types";
import {
    loadEnv,
    hasCloudflareKeys,
    loadSearchConfig,
    loadActiveProfile,
    getProfileSkills,
    getProfileTargetRoles,
    ROOT,
} from "./config";
import {
    IST_OFFSET_HOURS,
    MS_PER_HOUR,
    SCORE_STRONG,
    SCORE_REVIEW,
    SCORE_WEAK,
    HEURISTIC_MAX_SCORE,
    AI_EVAL_BUDGET,
} from "./constants";
import { scanJobs } from "./scan";
import { deduplicateJobs, filterSeenJobs } from "./dedup";
import { evaluateJobs } from "./evaluate";
import { rankJobs, filterForDigest } from "./rank";
import { isSeniorRole } from "./seniority";
import { researchAccelerators } from "./research";
import type { AcceleratorCompany } from "./types";
import { buildViewModel } from "./viewModel";
import { renderEmail, renderText } from "./renderer";
import { sendEmail } from "./mailer";

const SEEN_PATH = resolve(ROOT, "data/digest-seen.json");

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
        evaluate: parseInt(argVal("evaluate", String(AI_EVAL_BUDGET)), 10) || 0,
        mock: argFlag("mock"),
        research: argFlag("research"),
    };
}

// ─── Main ─────────────────────────────────────────────────────

export async function main(
    options?: Record<string, string | boolean>,
    root?: string,
): Promise<DigestResult> {
    const opts: DigestOptions = options
        ? {
              mode: String(options.mode || "preview"),
              query: String(options.query || "auto"),
              max: parseInt(String(options.max || "50"), 10) || 50,
              evaluate:
                  parseInt(
                      String(options.evaluate || AI_EVAL_BUDGET),
                      10,
                  ) || 0,
              mock: Boolean(options.mock),
              research: Boolean(options.research),
          }
        : {
              mode: "preview",
              query: "auto",
              max: 50,
              evaluate: AI_EVAL_BUDGET,
              mock: false,
              research: false,
          };

    const env = loadEnv(root);

    console.log(
        `Digest mode=${opts.mode} query="${opts.query}" max=${opts.max} ai_budget=${hasCloudflareKeys(env) ? opts.evaluate : 0} mock=${opts.mock}`,
    );

    const searchConfig = loadSearchConfig();
    console.log(
        `Config: score_threshold=${searchConfig.score_threshold} max_per_digest=${searchConfig.max_per_digest} max_age_days=${searchConfig.max_age_days}`,
    );

    // Scan
    const scanResult = await scanJobs({ query: opts.query, mock: opts.mock });
    let allJobs = scanResult.jobs;

    // Cross-portal dedup (same company::title::url from multiple sources)
    const deduped = deduplicateJobs(allJobs);
    if (deduped.duplicates > 0) {
        console.log(`Deduped ${deduped.duplicates} cross-portal duplicates`);
        allJobs = deduped.unique;
    }

    // Dedup against seen jobs
    const seen = loadSeen(root);
    const fresh = filterSeenJobs(allJobs, seen);
    console.log(`Scanned: ${allJobs.length} jobs | Fresh: ${fresh.length}`);

    // Research accelerators (if enabled)
    let researchCompanies: AcceleratorCompany[] = [];
    if (opts.research) {
        try {
            const researchResult = await researchAccelerators({
                maxPerAccelerator: 20,
                output: true,
            });
            researchCompanies = researchResult.accelerators.flatMap(
                (a: { companies: AcceleratorCompany[] }) => a.companies,
            );
            console.log(
                `Research: ${researchCompanies.length} companies from ${researchResult.accelerators.length} accelerators`,
            );
        } catch (e) {
            console.warn(`Accelerator research failed: ${e}`);
        }
    }

    // Spend the AI budget on the best-fitting candidates, not on whichever
    // jobs the scanner happened to return first.
    const aiBudget = Math.min(
        opts.evaluate,
        hasCloudflareKeys(env) ? fresh.length : 0,
    );
    const prioritized = aiBudget > 0 ? prioritizeForAi(fresh) : fresh;

    if (hasCloudflareKeys(env) && opts.evaluate > 0) {
        await evaluateJobs(prioritized, { limit: aiBudget });
        const aiScored = fresh.filter((j) => j.evaluation).length;
        console.log(
            `AI-scored ${aiScored}/${fresh.length} fresh jobs (budget ${aiBudget}, best-fit first)`,
        );
    }

    // Heuristic fallback for anything the AI budget did not reach
    // (no keys configured, or jobs beyond the budget).
    const unscoredBefore = fresh.filter((j) => !j.evaluation?.overall).length;
    if (unscoredBefore > 0) {
        applyHeuristicScores(fresh);
        const scored = fresh.filter((j) => j.evaluation?.overall).length;
        const heuristicOnly = scored - (fresh.length - unscoredBefore);
        console.log(
            `Heuristic scored ${heuristicOnly} job${heuristicOnly === 1 ? "" : "s"} (capped at ${HEURISTIC_MAX_SCORE} — below SCORE_STRONG)`,
        );
    }

    // Rank and filter
    const ranked = rankJobs(fresh, { minScore: searchConfig.score_threshold });
    const digestJobs = filterForDigest(ranked, searchConfig.max_per_digest);

    console.log(
        `Digest: ${digestJobs.length} scored jobs (unscored ${ranked.unscored.length} excluded from email)`,
    );

    // No jobs meet threshold: preserve seen state, return early
    if (digestJobs.length === 0) {
        console.log("No jobs met the score threshold. Digest skipped.");
        return {
            scanned: allJobs.length,
            fresh: fresh.length,
            digestJobs: 0,
            unscored: ranked.unscored.length,
            researchCompanies: researchCompanies.length,
            sent: false,
            mode: opts.mode,
        };
    }

    // Build view model
    const now = new Date();
    const ist = new Date(now.getTime() + IST_OFFSET_HOURS * MS_PER_HOUR * 1000);
    const dateStr =
        ist.toISOString().replace("T", " ").substring(0, 16) + " IST";

    const acceleratorResearch =
        researchCompanies.length > 0
            ? {
                  accelerators: [
                      ...new Set(researchCompanies.map((c) => c.accelerator)),
                  ].map((accName) => ({
                      name: accName,
                      batch:
                          researchCompanies.find(
                              (c) => c.accelerator === accName,
                          )?.batch || "unknown",
                      companies: researchCompanies
                          .filter((c) => c.accelerator === accName)
                          .map((c) => ({
                              name: c.name,
                              url: c.url,
                              careersUrl: c.careersUrl,
                              techStack: c.techStack,
                              tags: c.tags,
                          })),
                  })),
                  totalCompanies: researchCompanies.length,
              }
            : null;

    const viewModel = buildViewModel(digestJobs, {
        dateStr,
        totalScanned: allJobs.length,
        freshCount: fresh.length,
        unscoredCount: ranked.unscored.length,
        acceleratorResearch,
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

    // Send email
    const result = await sendEmail({ subject, text, html });

    // Mark seen ONLY after successful delivery in daily mode
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
        researchCompanies: researchCompanies.length,
        sent: result.sent,
        provider: result.provider,
        mode: opts.mode,
    };
}

// ─── Heuristic prescreen ──────────────────────────────────────

/**
 * Cheap keyword-overlap pre-score, used to decide which jobs deserve the AI
 * budget. Returns an unbounded "raw" figure on purpose: the *ordering* is what
 * matters here, and clamping to the display ceiling before sorting would tie
 * every decent job together and make the ordering arbitrary.
 *
 * Also used as the final fallback score when a job is outside the AI budget.
 */
function heuristicScore(
    job: Job,
    skills: string[],
    targetRoles: string[],
): number {
    const hay =
        `${job.title} ${job.snippet || ""} ${job.description || ""} ${(job.tags || []).join(" ")}`.toLowerCase();

    let skillHits = 0;
    for (const s of skills) if (hay.includes(s)) skillHits++;
    const skillScore = Math.min(2, skillHits * 0.35); // 0-2

    let roleBonus = 0;
    for (const r of targetRoles) if (hay.includes(r)) roleBonus = 0.6;

    // Same rule as rank.ts — previously a looser duplicate regex that matched
    // "lead"/"manager" anywhere in the description body.
    const seniorPenalty = isSeniorRole(job.title, job.snippet) ? 0.8 : 0;

    const remoteBonus = job.remote || /remote/.test(hay) ? 0.2 : 0;

    // base 3.0 so borderline jobs appear in "to review" rather than vanishing
    return Math.max(
        1,
        3.0 + skillScore + roleBonus + remoteBonus - seniorPenalty,
    );
}

function loadHeuristicInputs(): { skills: string[]; targetRoles: string[] } {
    const profile = loadActiveProfile();
    return {
        skills: getProfileSkills(profile)
            .split(",")
            .map((s: string) => s.trim().toLowerCase())
            .filter(Boolean),
        targetRoles: getProfileTargetRoles(profile).map((r: string) =>
            r.toLowerCase(),
        ),
    };
}

/**
 * Order jobs by heuristic fit without mutating them, so the AI budget can be
 * spent on the best candidates instead of on whatever the scanner returned
 * first.
 */
export function prioritizeForAi(jobs: Job[]): Job[] {
    try {
        const { skills, targetRoles } = loadHeuristicInputs();
        return [...jobs].sort(
            (a, b) =>
                heuristicScore(b, skills, targetRoles) -
                heuristicScore(a, skills, targetRoles),
        );
    } catch (e) {
        console.warn(`Heuristic ordering unavailable: ${e}`);
        return jobs;
    }
}

export function applyHeuristicScores(jobs: Job[]): void {
    // Fallback for jobs the AI budget did not reach. Capped at
    // HEURISTIC_MAX_SCORE so a keyword overlap can never outrank a real
    // evaluation.
    try {
        const { skills, targetRoles } = loadHeuristicInputs();

        for (const job of jobs) {
            if (job.evaluation?.overall) continue;
            const hay =
                `${job.title} ${job.snippet || ""} ${job.description || ""} ${(job.tags || []).join(" ")}`.toLowerCase();

            const unbounded = heuristicScore(job, skills, targetRoles);
            const seniorPenalty = isSeniorRole(job.title, job.snippet) ? 0.8 : 0;
            const overall = Math.min(unbounded, HEURISTIC_MAX_SCORE);

            const verdict = (
                overall >= SCORE_STRONG
                    ? "strong"
                    : overall >= SCORE_REVIEW
                      ? "review"
                      : overall >= SCORE_WEAK
                        ? "maybe"
                        : "skip"
            ) as NonNullable<Job["evaluation"]>["verdict"];

            const skillHits = skills.filter((s) => hay.includes(s)).length;
            const skillScore = Math.min(2, skillHits * 0.35);

            job.evaluation = {
                overall: Math.round(overall * 10) / 10,
                rawOverall: Math.round(overall * 10) / 10,
                roleFit: Math.round((3.0 + skillScore) * 10) / 10,
                locationFit: job.remote ? 4 : 3,
                growth: 3.3,
                compensationFit: 3.2,
                cultureFit: 3.3,
                verdict,
                recommendation:
                    verdict === "strong" || verdict === "review"
                        ? "Heuristic match — review posting"
                        : "Heuristic — low overlap",
                whyMatch: skillHits ? [`${skillHits} skill overlap`] : [],
                matchedSkills: skills
                    .filter((s) => hay.includes(s))
                    .slice(0, 4),
                redFlags: seniorPenalty ? ["May be senior-level"] : [],
            };
        }
    } catch {
        // never block digest on heuristic
    }
}
