#!/usr/bin/env node

/**
 * reverseEngineer.mjs — Reverse-engineer job descriptions
 * Analyzes matched jobs to find patterns, common requirements,
 * and suggests AI integration angles for Wellfound outreach.
 *
 * Usage:
 *   node scripts/reverseEngineer.mjs                    — Analyze recent jobs
 *   node scripts/reverseEngineer.mjs --company "Stripe" — Research specific company
 *   node scripts/reverseEngineer.mjs --limit 20         — Analyze more jobs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
    loadActiveProfile,
    getProfileSkills,
    getProfileExperience,
    getProfileTargetRoles,
} from "./lib/profile.mjs";
import { loadEnv } from "./lib/env.mjs";
import { cfAI } from "./lib/ai.mjs";
import { argVal } from "./lib/args.mjs";
import { runScan } from "./lib/scan.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

loadEnv(ROOT);

const COMPANY = argVal("company", null);
const LIMIT = parseInt(argVal("limit", "15"), 10) || 15;

async function main() {
    const profile = loadActiveProfile();
    const mySkills = getProfileSkills(profile);
    const experience = getProfileExperience(profile);
    const targetRoles = getProfileTargetRoles(profile);

    let jobs = [];

    if (COMPANY) {
        // Research specific company
        console.log(`\n Researching ${COMPANY}...\n`);
        const queries = targetRoles.slice(0, 3);
        for (const q of queries) {
            try {
                const results = await runScan(q, "any");
                jobs = jobs.concat(
                    results.filter((j) =>
                        j.company.toLowerCase().includes(COMPANY.toLowerCase()),
                    ),
                );
            } catch (e) {
                console.error(`Scan error: ${e.message}`);
            }
        }
    } else {
        // Analyze recent jobs
        console.log(
            `\n Reverse-engineering ${LIMIT} recent job descriptions...\n`,
        );
        const queries = targetRoles.slice(0, 3);
        for (const q of queries) {
            try {
                const results = await runScan(q, "any");
                jobs = jobs.concat(results);
            } catch (e) {
                console.error(`Scan error: ${e.message}`);
            }
        }
    }

    // Deduplicate
    const seen = new Set();
    const unique = jobs
        .filter((j) => {
            const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, LIMIT);

    if (unique.length === 0) {
        console.log("No jobs found to analyze.");
        return;
    }

    console.log(`Found ${unique.length} jobs to analyze:\n`);
    unique.forEach((j, i) =>
        console.log(`  ${i + 1}. ${j.title} @ ${j.company} (${j.location})`),
    );

    // Build analysis prompt
    const jobSummaries = unique
        .map(
            (j, i) =>
                `[${i + 1}] ${j.title} at ${j.company}\n   Location: ${j.location}\n   Description: ${(j.snippet || "").substring(0, 200)}`,
        )
        .join("\n\n");

    const prompt = `Analyze these ${unique.length} job postings and provide a reverse-engineering report.

MY PROFILE:
- Experience: ${experience}
- Skills: ${mySkills}
- Target roles: ${targetRoles.join(", ")}

JOB POSTINGS:
${jobSummaries}

Provide a markdown report with:

## 1. Skill Patterns
What skills/tech appear most frequently? What's the "hidden curriculum" (unstated requirements)?

## 2. Company Patterns  
What types of companies are hiring? (Stage, industry, size)

## 3. Role Patterns
What are the common responsibilities? What projects would I likely work on?

## 4. Gap Analysis
What's the #1 skill gap I should close? Specific resources to learn it.

## 5. AI Integration Angles (for Wellfound outreach)
For each unique company, suggest ONE specific AI/automation use case they could implement.
Format: "Company: [use case idea] — why it fits them"

## 6. Actionable Next Steps
- Top 3 things to learn this week
- Top 3 companies to research deeper
- Specific project ideas that would impress these employers`;

    console.log("\n Generating reverse-engineering report...\n");

    const report = await cfAI(prompt);
    console.log(report);

    // Save report
    const reportsDir = resolve(ROOT, "reports");
    if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
    const date = new Date().toISOString().split("T")[0];
    const reportFile = resolve(reportsDir, `reverse-engineer-${date}.md`);
    writeFileSync(
        reportFile,
        `# Reverse-Engineering Report — ${date}\n\n${report}\n`,
    );
    console.log(`\n Report saved to: ${reportFile}`);
}

main().catch((e) => {
    console.error(`Reverse-engineer failed: ${e.message}`);
    process.exit(1);
});
