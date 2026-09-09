/**
 * tools/interview.ts — Interview prep pack generator
 *
 * Usage: bun run src/cli/index.ts interview --company "Company" --stage "stage"
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { loadActiveProfile, getProfileCandidate, getProfileSkills, getProfileExperience } from "../lib/profile.js";
import { readTracker, findRow } from "../tracker/index.js";
import { callCloudflareAI } from "../ai/index.js";
import { loadEnv, hasCloudflareKeys } from "../config/env.js";

const ROOT = resolve(import.meta.dir, "..", "..");
const CV_PATH = resolve(ROOT, "config/cv.md");

export interface InterviewOptions {
    company: string;
    stage?: string;
}

export async function runInterview(options: InterviewOptions): Promise<void> {
    const { company, stage = "Technical" } = options;

    const entry = findRow(readTracker(), company);
    if (!entry) {
        console.error(
            `Company "${company}" not found in tracker. Add it first with: bun run src/cli/index.ts tracker add --company "${company}" --role "Role"`,
        );
        process.exit(1);
    }

    const profile = loadActiveProfile();
    const candidate = getProfileCandidate(profile);
    const skills = getProfileSkills(profile);
    const experience = getProfileExperience(profile);

    const baseCv = existsSync(CV_PATH) ? readFileSync(CV_PATH, "utf-8") : "";

    const prompt = `Generate an interview prep pack for the following:

CANDIDATE: ${candidate.name || "Candidate"}
EXPERIENCE: ${experience}
SKILLS: ${skills}

APPLICATION:
Company: ${company}
Role: ${entry.role}
Status: ${entry.status}
Score: ${entry.score}
Current Interview Stage: ${stage}

BASE CV (excerpt):
${baseCv.substring(0, 3000)}

Generate a stage-specific prep pack in markdown with these sections:
1. Company Overview — 2-3 sentences on what they do and their market position
2. Likely Questions — 5 questions specific to this role and stage (Technical, System Design, Behavioral, etc.)
3. STAR-Mapped Answers — map 3 of your likely questions to STAR format using only real experience from your CV
4. Questions to Ask Them — 4 thoughtful questions about the team, tech stack, and growth

Do not invent experience. If a STAR answer requires a metric you don't have, state the action without inventing a number.`;

    console.log(`Preparing interview pack for ${company} — ${stage}...`);

    const env = loadEnv();
    if (!hasCloudflareKeys(env)) {
        console.error("No Cloudflare AI keys found. Set CLOUDFLARE_API_KEY and CLOUDFLARE_ACCOUNT_ID.");
        process.exit(1);
    }

    const content = await callCloudflareAI(prompt, env);

    console.log(`\n# Interview Prep: ${company} — ${stage}\n`);
    console.log(content);
}
