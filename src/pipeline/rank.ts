/**
 * pipeline/rank.ts — Job ranking and filtering
 *
 * Filters jobs by score threshold and sorts by overall fit.
 * This replaces the subprocess-based rank.mjs.
 */

import type { Job } from "../domain/job";
import { SCORE_STRONG, SCORE_REVIEW } from "../lib/constants";

// ─── Types ────────────────────────────────────────────────────

export interface RankOptions {
    minScore?: number;
    maxJobs?: number;
}

export interface RankResult {
    strongMatches: Job[];
    worthReviewing: Job[];
    belowThreshold: Job[];
    unscored: Job[];
}

// ─── Seniority detection ──────────────────────────────────────

const SENIOR_INDICATORS = [
    "senior",
    "staff",
    "principal",
    "lead",
    "manager",
    "director",
    "vp",
    "head of",
    "architect",
    "fellow",
    "distinguished",
    "staff engineer",
    "principal engineer",
    "iii",
    "iv",
    "v",
    "5+ years",
    "6+ years",
    "7+ years",
    "8+ years",
];

function isSeniorRole(title: string, snippet?: string): boolean {
    const text = `${title} ${snippet || ""}`.toLowerCase();
    return SENIOR_INDICATORS.some((ind) => text.includes(ind));
}

// ─── Downgrade senior roles ───────────────────────────────────

function downgradeSeniorRoles(jobs: Job[]): void {
    for (const job of jobs) {
        if (
            job.evaluation &&
            isSeniorRole(job.title, job.snippet) &&
            job.evaluation.overall >= SCORE_STRONG
        ) {
            job.evaluation.overall = Math.min(
                job.evaluation.overall,
                SCORE_REVIEW,
            );
            job.evaluation.recommendation =
                job.evaluation.recommendation ||
                "Seniority mismatch — review before applying";
            if (
                !job.evaluation.redFlags.includes(
                    "JD appears senior-level; confirm junior/entry fit",
                )
            ) {
                job.evaluation.redFlags.push(
                    "JD appears senior-level; confirm junior/entry fit",
                );
            }
        }
    }
}

// ─── Main ranking function ────────────────────────────────────

export function rankJobs(jobs: Job[], options: RankOptions = {}): RankResult {
    const { minScore = SCORE_REVIEW, maxJobs = 50 } = options;

    // Downgrade senior-mismatch jobs
    downgradeSeniorRoles(jobs);

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

    // Sort each category by score descending
    const sortByScore = (a: Job, b: Job) =>
        (b.evaluation?.overall || 0) - (a.evaluation?.overall || 0);

    result.strongMatches.sort(sortByScore);
    result.worthReviewing.sort(sortByScore);
    result.belowThreshold.sort(sortByScore);

    // Sort unscored by posted date descending
    result.unscored.sort((a, b) =>
        String(b.postedAt || "").localeCompare(String(a.postedAt || "")),
    );

    console.log(
        `Ranked: ${result.strongMatches.length} strong, ${result.worthReviewing.length} review, ${result.belowThreshold.length} below, ${result.unscored.length} unscored`,
    );

    return result;
}

// ─── Filter for digest ────────────────────────────────────────

export function filterForDigest(
    ranked: RankResult,
    maxJobs: number = 10,
): Job[] {
    // Only scored jobs enter the digest
    const scored = [...ranked.strongMatches, ...ranked.worthReviewing];
    return scored.slice(0, maxJobs);
}
