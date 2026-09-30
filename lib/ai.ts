/**
 * lib/ai.ts — Cloudflare AI integration
 *
 * Provides AI-powered job evaluation using Cloudflare Workers AI.
 */

import { loadEnv, hasCloudflareKeys } from "./config";
import type { Env } from "./types";
import { SCORE_STRONG, SCORE_REVIEW, CV_TRUNCATE } from "./constants";
import type { AIEvaluationPrompt, AIEvaluationResult, Verdict } from "./types";

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

/** Caps mirroring the prompt contract, so a verbose reply cannot bloat the email. */
const MAX_WHY_MATCH = 3;
const MAX_MATCHED_SKILLS = 5;
const MAX_RED_FLAGS = 5;

/**
 * Coerce a model-supplied field to a capped array of non-empty strings.
 * Returns [] when the field is absent or malformed — reasoning is useful but
 * never worth failing an otherwise valid evaluation over.
 */
function stringList(value: unknown, max: number): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, max);
}

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
  "whyMatch": ["<string>"],
  "matchedSkills": ["<string>"],
  "redFlags": ["<string>"]
}

whyMatch — 2 to 3 reasons, maximum 3. These are the only explanation the
candidate sees, so make them specific to THIS posting:
- Ground each one in something the job description actually says
- "Your TypeScript and React experience covers their frontend stack"
- "They list 4 of your 6 core skills as required"
- Never restate the score ("strong match", "good fit") — the score is shown
  alongside, so repeating it wastes the reader's attention
- If there is genuinely nothing specific, return fewer items rather than filler

matchedSkills — maximum 5. Only skills the candidate already lists that this job
actually uses. Do not invent skills, and do not list a skill the job never
mentions.

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
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;

        const parsed = JSON.parse(jsonMatch[0]);

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
            whyMatch: stringList(parsed.whyMatch, MAX_WHY_MATCH),
            matchedSkills: stringList(parsed.matchedSkills, MAX_MATCHED_SKILLS),
            redFlags: stringList(parsed.redFlags, MAX_RED_FLAGS),
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
