/**
 * lib/tailor.ts — CV tailoring
 *
 * Generates ATS-optimized CVs and cover letters for specific jobs.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { loadEnv, hasCloudflareKeys } from "./config";
import {
    loadActiveProfile,
    getProfileSkills,
    getProfileExperience,
} from "./config";
import { CV_TRUNCATE } from "./constants";
import { callCloudflareAI } from "./ai";
import type { TailorOptions, TailorResult } from "./types";

const ROOT = resolve(import.meta.dir, "..");
const OUTPUT_DIR = resolve(ROOT, "output");
const CV_PATH = resolve(ROOT, "config/cv.md");

// ─── Main ─────────────────────────────────────────────────────

export async function runTailor(options: TailorOptions): Promise<TailorResult> {
    const { company, role, description } = options;

    console.log(`Tailoring CV for: ${role} at ${company}`);

    const profile = loadActiveProfile();
    const skills = getProfileSkills(profile);
    const experience = getProfileExperience(profile);

    if (!existsSync(CV_PATH)) {
        throw new Error(
            `CV not found at ${CV_PATH}. Please create config/cv.md`,
        );
    }
    const baseCv = readFileSync(CV_PATH, "utf-8");

    const prompt = buildTailorPrompt({
        baseCv,
        skills,
        experience,
        company,
        role,
        description: description || "",
    });

    const env = loadEnv();
    if (!hasCloudflareKeys(env)) {
        throw new Error("Cloudflare AI keys required for tailoring");
    }

    const response = await callCloudflareAI(prompt, env);
    const tailored = parseTailorResponse(response);

    if (!existsSync(OUTPUT_DIR)) {
        mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const safeCompany = company.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    const safeRole = role.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    const timestamp = new Date().toISOString().split("T")[0];

    const cvOutputPath = resolve(
        OUTPUT_DIR,
        `${safeCompany}-${safeRole}-cv-${timestamp}.md`,
    );
    const clOutputPath = resolve(
        OUTPUT_DIR,
        `${safeCompany}-${safeRole}-cover-letter-${timestamp}.md`,
    );

    writeFileSync(cvOutputPath, tailored.cv);
    writeFileSync(clOutputPath, tailored.coverLetter);

    console.log(`CV saved to: ${cvOutputPath}`);
    console.log(`Cover letter saved to: ${clOutputPath}`);

    return {
        cvPath: cvOutputPath,
        coverLetterPath: clOutputPath,
    };
}

// ─── Prompt Builder ───────────────────────────────────────────

interface TailorPromptInput {
    baseCv: string;
    skills: string;
    experience: string;
    company: string;
    role: string;
    description: string;
}

function buildTailorPrompt(input: TailorPromptInput): string {
    return `Tailor this CV and write a cover letter for the following job.

BASE CV:
${input.baseCv.substring(0, CV_TRUNCATE)}

CANDIDATE:
Skills: ${input.skills}
Experience: ${input.experience}

JOB:
Company: ${input.company}
Role: ${input.role}
Description: ${input.description.substring(0, CV_TRUNCATE)}

Return JSON with:
{
  "cv": "<tailored CV in markdown>",
  "coverLetter": "<cover letter in markdown>"
}

Requirements:
1. Mirror keywords from the job description into the CV
2. Highlight relevant skills and experience
3. Keep the same structure as the base CV
4. Cover letter should be 3-4 paragraphs, specific to this role
5. No fabricated experience — only rephrase existing content`;
}

// ─── Response Parser ──────────────────────────────────────────

interface TailorResponse {
    cv: string;
    coverLetter: string;
}

function parseTailorResponse(response: string): TailorResponse {
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("No JSON found in response");
        }

        const parsed = JSON.parse(jsonMatch[0]);

        if (!parsed.cv || !parsed.coverLetter) {
            throw new Error("Missing cv or coverLetter in response");
        }

        return {
            cv: parsed.cv,
            coverLetter: parsed.coverLetter,
        };
    } catch (e) {
        console.error("Failed to parse tailor response:", e);
        return {
            cv: "# Tailored CV\n\nFailed to generate CV. Please try again.",
            coverLetter:
                "# Cover Letter\n\nFailed to generate cover letter. Please try again.",
        };
    }
}
