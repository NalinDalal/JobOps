/**
 * lib/evaluate.ts — Job evaluation using Cloudflare AI
 *
 * Scores jobs against the user profile across 5 dimensions.
 */

import type {
    Job,
    JobEvaluation,
    AIEvaluationPrompt,
    AIEvaluationResult,
    Env,
} from "./types";
import {
    loadActiveProfile,
    getProfileSkills,
    getProfileExperience,
    getProfileTargetRoles,
    getProfileTargetLocations,
} from "./config";
import {
    SCORE_STRONG,
    SCORE_REVIEW,
    CV_TRUNCATE,
    AI_EVAL_CONCURRENCY,
} from "./constants";
import { loadEnv, hasCloudflareKeys } from "./config";
import {
    callCloudflareAI,
    buildEvaluationPrompt,
    parseEvaluationResponse,
    scoreToVerdict,
} from "./ai";

// ─── Profile loading ──────────────────────────────────────────

function loadProfileForEvaluation() {
    const profile = loadActiveProfile();
    return {
        skills: getProfileSkills(profile),
        targetRoles: getProfileTargetRoles(profile).join(", "),
        targetLocations: getProfileTargetLocations(profile).join(", "),
        experience: getProfileExperience(profile),
        salary:
            ((profile.data.preferences as Record<string, unknown>)
                ?.salary_range as string) || "Negotiable",
    };
}

// ─── Single job evaluation ────────────────────────────────────

export async function evaluateJob(job: Job): Promise<JobEvaluation | null> {
    const env = loadEnv();
    if (!hasCloudflareKeys(env)) {
        console.warn("No Cloudflare AI keys found, skipping evaluation");
        return null;
    }

    const profile = loadProfileForEvaluation();

    const prompt: AIEvaluationPrompt = {
        skills: profile.skills,
        targetRoles: profile.targetRoles,
        targetLocations: profile.targetLocations,
        experience: profile.experience,
        salary: profile.salary,
        job: {
            title: job.title,
            company: job.company,
            location: job.location || "Not specified",
            description: (job.description || job.snippet || "").substring(
                0,
                CV_TRUNCATE,
            ),
        },
    };

    try {
        console.log(`Evaluating: ${job.title} at ${job.company}...`);
        const raw = await callCloudflareAI(buildEvaluationPrompt(prompt), env);

        const parsed = parseEvaluationResponse(raw);
        if (!parsed) {
            throw new Error("Failed to parse evaluation response");
        }

        // Factor in entry-level fit
        if (parsed.entryLevelFit && parsed.entryLevelFit < 3) {
            const penalty = (3 - parsed.entryLevelFit) * 0.3;
            parsed.overall = Math.max(1, parsed.overall - penalty);
            parsed.redFlags.push(
                `Requires more experience than candidate has (entry-level fit: ${parsed.entryLevelFit}/5)`,
            );
        }

        // Calculate overall if not provided
        if (!parsed.overall || parsed.overall === 3.0) {
            const scores = [
                parsed.roleFit,
                parsed.locationFit,
                parsed.growth,
                parsed.compFit,
                parsed.cultureFit,
            ];
            if (parsed.entryLevelFit) scores.push(parsed.entryLevelFit);
            parsed.overall = scores.reduce((a, b) => a + b, 0) / scores.length;
        }

        const verdict = scoreToVerdict(parsed.overall);

        return {
            overall: parsed.overall,
            roleFit: parsed.roleFit,
            locationFit: parsed.locationFit,
            growth: parsed.growth,
            compensationFit: parsed.compFit,
            cultureFit: parsed.cultureFit,
            verdict,
            recommendation: parsed.recommendation,
            // Model reasoning drives the email's "why this matches" section.
            whyMatch: parsed.whyMatch || [],
            matchedSkills: parsed.matchedSkills || [],
            redFlags: parsed.redFlags,
        };
    } catch (e) {
        console.error(
            `Evaluation failed for ${job.title} at ${job.company}: ${e}`,
        );
        return null;
    }
}

// ─── Batch evaluation ─────────────────────────────────────────

export interface EvaluateOptions {
    /** Maximum number of jobs to send to the model. */
    limit?: number;
    /** Maximum number of requests in flight at once. */
    concurrency?: number;
}

/**
 * Evaluate the first `limit` jobs, keeping at most `concurrency` requests
 * in flight.
 *
 * `limit` and `concurrency` are deliberately separate: conflating them meant
 * the caller's job budget was silently used as the parallelism, so only a
 * handful of jobs were ever scored by AI and the rest fell through to the
 * heuristic scorer.
 */
export async function evaluateJobs(
    jobs: Job[],
    options: EvaluateOptions = {},
): Promise<Job[]> {
    const { limit = 5, concurrency = AI_EVAL_CONCURRENCY } = options;

    const env = loadEnv();
    if (!hasCloudflareKeys(env)) {
        console.warn("No Cloudflare AI keys found, skipping all evaluations");
        return jobs;
    }

    const targets = jobs.slice(0, Math.max(0, limit));
    if (targets.length === 0) {
        console.warn("No jobs to evaluate (limit resolved to 0)");
        return jobs;
    }

    const workers = Math.max(1, Math.min(concurrency, targets.length));
    console.log(
        `Evaluating ${targets.length} job${targets.length === 1 ? "" : "s"} with Cloudflare AI (${workers} concurrent)...`,
    );

    // Worker pool over a shared cursor, so a slow request cannot stall the rest.
    const results = new Array<JobEvaluation | null>(targets.length).fill(null);
    let cursor = 0;

    const drain = async (): Promise<void> => {
        for (;;) {
            const i = cursor++;
            if (i >= targets.length) return;
            try {
                results[i] = await evaluateJob(targets[i]!);
            } catch (e) {
                // evaluateJob already handles its own failures; belt and braces
                // so one bad job cannot reject the whole batch.
                console.error(`Evaluation failed for job index ${i}: ${e}`);
            }
        }
    };

    await Promise.all(Array.from({ length: workers }, () => drain()));

    let scored = 0;
    for (let i = 0; i < targets.length; i++) {
        const result = results[i];
        if (result) {
            targets[i]!.evaluation = result;
            scored++;
        }
    }
    if (scored < targets.length) {
        console.warn(
            `Only ${scored}/${targets.length} evaluations succeeded — remainder will use heuristic scoring`,
        );
    }

    return jobs;
}
