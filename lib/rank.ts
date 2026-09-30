/**
 * lib/rank.ts — Job ranking and filtering
 *
 * Filters jobs by score threshold and sorts by overall fit.
 */

import type { Job, RankOptions, RankResult } from "./types";
import { scoreToVerdict } from "./types";
import { SCORE_STRONG, SCORE_REVIEW, SCORE_SENIOR_EXCLUDED } from "./constants";
import { isSeniorRole } from "./seniority";

// ─── Exclude senior roles ─────────────────────────────────────

const SENIOR_EXCLUSION_FLAG = "Senior-level role — outside target profile";
const SENIOR_ADVICE_FLAG =
    "Senior/Staff/Principal title; not an entry-level or early-career role";

/**
 * Exclude senior-level postings from the candidate set.
 *
 * The profile targets entry-level, junior and early-career roles, so a senior
 * posting is out of scope rather than merely a weak match. Scoring is forced
 * below any plausible inclusion threshold and the job is tagged
 * `seniorMismatch`, which `filterForDigest` also enforces — so exclusion does
 * not depend on the configured `score_threshold` staying where it is today.
 *
 * The pre-exclusion score is retained on `rawOverall` so the decision can be
 * re-applied for free, and re-running rank is idempotent.
 */
function excludeSeniorRoles(jobs: Job[]): void {
    for (const job of jobs) {
        const ev = job.evaluation;
        if (!ev) continue;

        // Record the model's score once. Re-running rank must not compound.
        if (ev.rawOverall === undefined) ev.rawOverall = ev.overall;

        // Already excluded — do not append the flags twice.
        if (ev.seniorMismatch) continue;

        if (!isSeniorRole(job.title, job.snippet)) continue;

        ev.seniorMismatch = true;
        ev.overall = Math.min(ev.overall, SCORE_SENIOR_EXCLUDED);
        // Keep the verdict consistent with the score it now reports.
        ev.verdict = scoreToVerdict(ev.overall);
        ev.recommendation = "Skip — senior-level role";
        for (const flag of [SENIOR_EXCLUSION_FLAG, SENIOR_ADVICE_FLAG]) {
            if (!ev.redFlags.includes(flag)) ev.redFlags.push(flag);
        }
    }
}

// ─── Main ranking function ────────────────────────────────────

export function rankJobs(jobs: Job[], options: RankOptions = {}): RankResult {
    const { minScore = SCORE_REVIEW, maxJobs = 50 } = options;

    excludeSeniorRoles(jobs);

    const result: RankResult = {
        strongMatches: [],
        worthReviewing: [],
        belowThreshold: [],
        unscored: [],
    };

    for (const job of jobs) {
        if (!job.evaluation?.overall) {
            result.unscored.push(job);
        } else if (job.evaluation.overall >= SCORE_STRONG) {
            result.strongMatches.push(job);
        } else if (job.evaluation.overall >= minScore) {
            result.worthReviewing.push(job);
        } else {
            result.belowThreshold.push(job);
        }
    }

    const sortByScore = (a: Job, b: Job) =>
        (b.evaluation?.overall || 0) - (a.evaluation?.overall || 0);

    result.strongMatches.sort(sortByScore);
    result.worthReviewing.sort(sortByScore);
    result.belowThreshold.sort(sortByScore);

    result.unscored.sort((a, b) =>
        String(b.postedAt || "").localeCompare(String(a.postedAt || "")),
    );

    console.log(
        `Ranked: ${result.strongMatches.length} strong, ${result.worthReviewing.length} review, ${result.belowThreshold.length} below, ${result.unscored.length} unscored`,
    );

    return result;
}

// ─── Filter for digest ────────────────────────────────────────

/**
 * Select the jobs that reach the email.
 *
 * Senior-level postings are dropped here as well, so exclusion holds even if
 * `score_threshold` is configured low enough for their forced score to pass.
 */
export function filterForDigest(
    ranked: RankResult,
    maxJobs: number = 10,
): Job[] {
    const scored = [...ranked.strongMatches, ...ranked.worthReviewing];
    return scored.filter((j) => !j.evaluation?.seniorMismatch).slice(0, maxJobs);
}
