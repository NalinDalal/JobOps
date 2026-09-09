/**
 * pipeline/evaluate.ts — Job evaluation using Cloudflare AI
 *
 * Scores jobs against the user profile across 5 dimensions.
 * This replaces the subprocess-based evaluate.mjs.
 */

import type { Job } from "../domain/job";
import type { JobEvaluation } from "../domain/evaluation";
import { scoreToVerdict } from "../domain/evaluation";
import {
    loadActiveProfile,
    getProfileSkills,
    getProfileExperience,
    getProfileTargetRoles,
    getProfileTargetLocations,
} from "../lib/profile";
import { SCORE_STRONG, SCORE_REVIEW, CV_TRUNCATE } from "../lib/constants";
import { loadEnv, hasCloudflareKeys, type Env } from "../config/env";

// ─── Types ────────────────────────────────────────────────────

export interface EvaluateOptions {
    concurrent?: number;
}

interface AIResponse {
    overall: number;
    roleFit: number;
    locationFit: number;
    growthPotential: number;
    compFit: number;
    cultureFit: number;
    entryLevelFit?: number;
    recommendation: string;
    analysis: string;
    redFlags: string[];
}

// ─── Cloudflare AI helper ─────────────────────────────────────

async function cfAI(prompt: string): Promise<string> {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken =
        process.env.CLOUDFLARE_API_KEY || process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
        throw new Error("Missing Cloudflare credentials");
    }

    const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messages: [{ role: "user", content: prompt }],
                max_tokens: 1024,
            }),
        },
    );

    if (!res.ok) {
        throw new Error(`Cloudflare AI error: ${res.status}`);
    }

    const data = (await res.json()) as { result?: { response?: string } };
    return data.result?.response || "";
}

function parseJSON(raw: string, fallback: AIResponse): AIResponse {
    try {
        // Try to extract JSON from the response
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            return { ...fallback, ...parsed };
        }
    } catch {
        // Fall back to default
    }
    return fallback;
}

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

    const prompt = `Evaluate this job for the candidate. Return ONLY a JSON object.

CANDIDATE:
Skills: ${profile.skills}
Target Roles: ${profile.targetRoles}
Preferred Locations: ${profile.targetLocations}
Experience: ${profile.experience}
Salary Expectation: ${profile.salary}

JOB:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || "Not specified"}
Description: ${(job.description || job.snippet || "").substring(0, CV_TRUNCATE)}

IMPORTANT: This candidate is Junior/Entry-level (0-2 years). Jobs requiring 5+ years of experience are a poor fit.

Rate 1-5 for each dimension:
- roleFit: How well does the role match skills and target roles?
- locationFit: Is the location compatible with preferences?
- growthPotential: Does this role offer career growth?
- compFit: Is the compensation likely competitive for the role?
- cultureFit: Does the company culture seem aligned?

Also provide:
- entryLevelFit: Is this role suitable for someone with 0-2 years experience? (1=requires 5+ years, 5=open to fresh graduates)
- recommendation: One-line recommendation
- analysis: 2-3 sentences of detailed analysis
- redFlags: Array of potential concerns (empty array if none)

Return JSON: {"overall":4.2,"roleFit":4.5,"locationFit":4.0,"growthPotential":4.5,"compFit":4.0,"cultureFit":4.0,"entryLevelFit":4.0,"recommendation":"Apply!","analysis":"...","redFlags":[]}`;

    try {
        console.log(`Evaluating: ${job.title} at ${job.company}...`);
        const raw = await cfAI(prompt);

        const fallback: AIResponse = {
            overall: 3.0,
            roleFit: 3.0,
            locationFit: 3.0,
            growthPotential: 3.0,
            compFit: 3.0,
            cultureFit: 3.0,
            entryLevelFit: 3.0,
            recommendation: "Manual review needed",
            analysis: "Could not parse AI evaluation.",
            redFlags: [],
        };

        const result = parseJSON(raw, fallback);

        // Factor in entry-level fit
        if (result.entryLevelFit && result.entryLevelFit < 3) {
            const penalty = (3 - result.entryLevelFit) * 0.3;
            result.overall = Math.max(1, result.overall - penalty);
            result.redFlags.push(
                `Requires more experience than candidate has (entry-level fit: ${result.entryLevelFit}/5)`,
            );
        }

        // Calculate overall if not provided
        if (!result.overall || result.overall === 3.0) {
            const scores = [
                result.roleFit,
                result.locationFit,
                result.growthPotential,
                result.compFit,
                result.cultureFit,
            ];
            if (result.entryLevelFit) scores.push(result.entryLevelFit);
            result.overall = scores.reduce((a, b) => a + b, 0) / scores.length;
        }

        const verdict = scoreToVerdict(result.overall);

        return {
            overall: result.overall,
            roleFit: result.roleFit,
            locationFit: result.locationFit,
            growth: result.growthPotential,
            compensationFit: result.compFit,
            cultureFit: result.cultureFit,
            verdict,
            recommendation: result.recommendation,
            whyMatch: [],
            matchedSkills: [],
            redFlags: result.redFlags,
        };
    } catch (e) {
        console.error(
            `Evaluation failed for ${job.title} at ${job.company}: ${e}`,
        );
        return null;
    }
}

// ─── Batch evaluation ─────────────────────────────────────────

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

    // Evaluate top N jobs concurrently
    const targets = jobs.slice(0, concurrent);
    const results = await Promise.allSettled(
        targets.map((j) => evaluateJob(j)),
    );

    // Merge evaluations back into jobs
    for (let i = 0; i < targets.length; i++) {
        const r = results[i];
        if (r && r.status === "fulfilled" && r.value) {
            targets[i]!.evaluation = r.value;
        }
    }

    return jobs;
}
