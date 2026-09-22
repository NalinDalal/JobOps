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
import { SCORE_STRONG, SCORE_REVIEW, CV_TRUNCATE } from "./constants";
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
            whyMatch: [],
            matchedSkills: [],
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
    concurrent?: number;
}

export async function evaluateJobs(
    jobs: Job[],
    options: EvaluateOptions = {},
): Promise<Job[]> {
    const { concurrent = 3 } = options;

    const env = loadEnv();
    if (!hasCloudflareKeys(env)) {
        console.warn("No Cloudflare AI keys found, skipping all evaluations");
        return jobs;
    }

    console.log(
        `Evaluating top ${Math.min(jobs.length, concurrent)} jobs with Cloudflare AI...`,
    );

    const targets = jobs.slice(0, concurrent);
    const results = await Promise.allSettled(
        targets.map((j) => evaluateJob(j)),
    );

    for (let i = 0; i < targets.length; i++) {
        const r = results[i];
        if (r && r.status === "fulfilled" && r.value) {
            targets[i]!.evaluation = r.value;
        }
    }

    return jobs;
}
