/**
 * ai/index.ts — Cloudflare AI integration
 *
 * Provides AI-powered job evaluation using Cloudflare Workers AI.
 */

import { loadEnv, hasCloudflareKeys, type Env } from "../config/env";
import { SCORE_STRONG, SCORE_REVIEW, CV_TRUNCATE } from "../lib/constants";
import type { JobEvaluation, Verdict } from "../domain/evaluation";

// ─── Types ────────────────────────────────────────────────────

export interface AIEvaluationPrompt {
    skills: string;
    targetRoles: string;
    targetLocations: string;
    experience: string;
    salary: string;
    job: {
        title: string;
        company: string;
        location: string;
        description: string;
    };
}

export interface AIEvaluationResult {
    overall: number;
    roleFit: number;
    locationFit: number;
    growth: number;
    compFit: number;
    cultureFit: number;
    entryLevelFit?: number;
    recommendation: string;
    redFlags: string[];
}

// ─── Cloudflare AI ────────────────────────────────────────────

export async function callCloudflareAI(
    prompt: string,
    env?: Env,
): Promise<string> {
    const config = env || loadEnv();

    if (!hasCloudflareKeys(config)) {
        throw new Error("No Cloudflare AI keys found");
    }

    const accountId = config.cloudflareAccountId;
    const apiKey = config.cloudflareApiKey;
    const model = config.cloudflareModel;

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            messages: [
                {
                    role: "system",
                    content:
                        "You are a job evaluation AI. Return ONLY valid JSON, no markdown, no explanation.",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(
            `Cloudflare AI ${res.status}: ${body.substring(0, 300)}`,
        );
    }

    const data = (await res.json()) as {
        success: boolean;
        result?: { response?: string };
    };

    if (!data.success || !data.result?.response) {
        throw new Error("Cloudflare AI returned empty response");
    }

    return data.result.response;
}

// ─── Evaluation ───────────────────────────────────────────────

export function buildEvaluationPrompt(prompt: AIEvaluationPrompt): string {
    return `Evaluate this job for the candidate. Return ONLY a JSON object.

CANDIDATE:
Skills: ${prompt.skills}
Target Roles: ${prompt.targetRoles}
Preferred Locations: ${prompt.targetLocations}
Experience: ${prompt.experience}
Salary Expectation: ${prompt.salary}

JOB:
Title: ${prompt.job.title}
Company: ${prompt.job.company}
Location: ${prompt.job.location}
Description: ${prompt.job.description.substring(0, CV_TRUNCATE)}

IMPORTANT: This candidate is Junior/Entry-level (0-2 years). Jobs requiring 5+ years of experience are a poor fit.

Return JSON with these fields:
{
  "overall": <0-5>,
  "roleFit": <0-5>,
  "locationFit": <0-5>,
  "growth": <0-5>,
  "compFit": <0-5>,
  "cultureFit": <0-5>,
  "entryLevelFit": <0-5>,
  "recommendation": "<string>",
  "redFlags": ["<string>"]
}

Scoring guide:
- 5: Perfect match
- 4: Strong match
- 3: Good match
- 2: Weak match
- 1: Poor match
- 0: Not a match`;
}

export function parseEvaluationResponse(
    response: string,
): AIEvaluationResult | null {
    try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;

        const parsed = JSON.parse(jsonMatch[0]);

        // Validate required fields
        if (
            typeof parsed.overall !== "number" ||
            typeof parsed.roleFit !== "number" ||
            typeof parsed.locationFit !== "number" ||
            typeof parsed.growth !== "number" ||
            typeof parsed.compFit !== "number" ||
            typeof parsed.cultureFit !== "number"
        ) {
            return null;
        }

        return {
            overall: parsed.overall,
            roleFit: parsed.roleFit,
            locationFit: parsed.locationFit,
            growth: parsed.growth,
            compFit: parsed.compFit,
            cultureFit: parsed.cultureFit,
            entryLevelFit: parsed.entryLevelFit,
            recommendation: parsed.recommendation || "",
            redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
        };
    } catch {
        return null;
    }
}

export function scoreToVerdict(score: number): Verdict {
    if (score >= SCORE_STRONG) return "strong";
    if (score >= SCORE_REVIEW) return "review";
    if (score >= 2) return "maybe";
    return "skip";
}
