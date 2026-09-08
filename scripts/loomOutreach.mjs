#!/usr/bin/env node

/**
 * loomOutreach.mjs — Wellfound company research + loom outreach flow
 * Finds companies, identifies AI use cases, drafts personalized outreach.
 *
 * Usage:
 *   node scripts/loomOutreach.mjs                      — Find 5 companies to target
 *   node scripts/loomOutreach.mjs --company "Razorpay" — Deep research on one company
 *   node scripts/loomOutreach.mjs --count 10           — Find more companies
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
    loadActiveProfile,
    getProfileSkills,
    getProfileExperience,
    getProfileCandidate,
} from "./lib/profile.mjs";
import { loadEnv } from "./lib/env.mjs";
import { cfAI } from "./lib/ai.mjs";
import { argVal } from "./lib/args.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

loadEnv(ROOT);

const COMPANY = argVal("company", null);
const COUNT = parseInt(argVal("count", "5"), 10) || 5;

async function main() {
    const profile = loadActiveProfile();
    const candidate = getProfileCandidate(profile);
    const mySkills = getProfileSkills(profile);
    const experience = getProfileExperience(profile);

    if (COMPANY) {
        // Deep research on one company
        console.log(`\n Deep research: ${COMPANY}\n`);

        const prompt = `Research the company "${COMPANY}" and create a personalized outreach strategy.

MY PROFILE:
- Name: ${candidate.name}
- Skills: ${mySkills}
- Experience: ${experience}
- GitHub: ${candidate.github || "N/A"}
- Portfolio: ${candidate.portfolio || "N/A"}

Provide:

## Company Research
- What does ${COMPANY} do? (1-2 sentences)
- Tech stack they likely use
- Recent news or launches
- Team size and stage

## AI Integration Angle
- ONE specific AI/automation use case for ${COMPANY}
- Why this fits their business
- Quick prototype I could build in 1-2 days
- Expected impact

## Loom Script (60 seconds)
Write a script for a Loom video:
1. Hook (5s): "Hey [Name], I noticed ${COMPANY} does X..."
2. Problem (15s): "I saw you're dealing with Y..."
3. Solution (20s): "I built a quick prototype that..."
4. CTA (10s): "Would love to show you how it works..."

## Email/DM Template
Write a short, personalized DM (under 100 words) that references the loom.

## Who to Contact
- Suggest 2-3 roles to reach out to (CTO, Engineering Manager, etc.)
- LinkedIn search strings to find them`;

        console.log("Generating research...\n");
        const report = await cfAI(prompt);
        console.log(report);

        // Save
        const reportsDir = resolve(ROOT, "reports");
        if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
        const date = new Date().toISOString().split("T")[0];
        const slug = COMPANY.toLowerCase().replace(/\s+/g, "-");
        const reportFile = resolve(reportsDir, `loom-${slug}-${date}.md`);
        writeFileSync(
            reportFile,
            `# Loom Outreach: ${COMPANY} — ${date}\n\n${report}\n`,
        );
        console.log(`\n Saved to: ${reportFile}`);
    } else {
        // Find companies to target
        console.log(`\n Finding ${COUNT} companies for loom outreach...\n`);

        const prompt = `Find ${COUNT} startups/companies that would benefit from AI integration.

MY PROFILE:
- Skills: ${mySkills}
- Experience: ${experience}

For each company, provide:
1. Company name
2. What they do (1 sentence)
3. AI use case I could build for them (specific, not generic)
4. Why they'd care (business impact)
5. Difficulty (Easy/Medium/Hard)
6. Who to contact (role title)

Focus on:
- Companies with public products I can try
- Real problems I can solve with AI/automation
- Mix of easy wins and impressive projects
- Companies hiring for roles matching my profile

Format as a numbered list with clear sections.`;

        console.log("Finding companies...\n");
        const report = await cfAI(prompt);
        console.log(report);

        // Save
        const reportsDir = resolve(ROOT, "reports");
        if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
        const date = new Date().toISOString().split("T")[0];
        const reportFile = resolve(reportsDir, `loom-targets-${date}.md`);
        writeFileSync(
            reportFile,
            `# Loom Outreach Targets — ${date}\n\n${report}\n`,
        );
        console.log(`\n Saved to: ${reportFile}`);
    }
}

main().catch((e) => {
    console.error(`Loom outreach failed: ${e.message}`);
    process.exit(1);
});
