/**
 * tools/upskill.ts — Skill gap analysis and learning plan generator
 *
 * Usage: bun run src/cli/index.ts upskill --query "software engineer" --limit 20
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { loadActiveProfile, getProfileSkills, getProfileTargetRoles, getProfileExperience } from "../lib/profile.js";
import { scanJobs } from "../pipeline/scan.js";
import { callCloudflareAI } from "../ai/index.js";
import { loadEnv, hasCloudflareKeys } from "../config/env.js";

const ROOT = resolve(import.meta.dir, "..", "..");

export interface UpskillOptions {
    query?: string;
    limit?: number;
}

function extractKeywords(text: string): Set<string> {
    const tokens = new Set<string>();
    const lower = text.toLowerCase();
    const common = new Set([
        "the",
        "and",
        "for",
        "with",
        "using",
        "from",
        "that",
        "this",
        "have",
        "has",
        "had",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "must",
        "can",
        "shall",
        "not",
        "are",
        "was",
        "were",
        "been",
        "being",
        "does",
        "did",
        "doing",
        "a",
        "an",
        "but",
        "or",
        "nor",
        "yet",
        "so",
        "in",
        "on",
        "at",
        "to",
        "by",
        "about",
        "as",
        "into",
        "through",
        "during",
        "before",
        "after",
        "above",
        "below",
        "between",
        "out",
        "off",
        "over",
        "under",
        "again",
        "further",
        "then",
        "once",
        "here",
        "there",
        "when",
        "where",
        "why",
        "how",
        "all",
        "both",
        "each",
        "few",
        "more",
        "most",
        "other",
        "some",
        "such",
        "no",
        "only",
        "own",
        "same",
        "than",
        "too",
        "very",
        "s",
        "t",
        "just",
        "don",
        "now",
        "also",
        "work",
        "working",
        "worked",
        "role",
        "job",
        "team",
        "experience",
        "years",
        "year",
        "looking",
        "strong",
        "proficient",
        "knowledge",
        "understanding",
        "etc",
        "including",
        "plus",
        "preferred",
        "required",
        "skills",
        "skill",
    ]);
    for (const m of lower.matchAll(/[a-z][a-z0-9+#.-]{1,}/g)) {
        const t = m[0].replace(/^[#.\-+]+|[#.\-+]+$/g, "");
        if (t.length >= 3 && !common.has(t)) tokens.add(t);
    }
    return tokens;
}

export async function runUpskill(options: UpskillOptions = {}): Promise<void> {
    const env = loadEnv();
    if (!hasCloudflareKeys(env)) {
        console.error("No Cloudflare AI keys found. Set CLOUDFLARE_API_KEY and CLOUDFLARE_ACCOUNT_ID.");
        process.exit(1);
    }

    const query = options.query || process.argv[2]?.split('"')[1] || "software engineer";
    const limit = options.limit || parseInt(process.argv[3] || "20", 10) || 20;

    const profile = loadActiveProfile();
    const queries =
        query.toLowerCase() === "auto"
            ? getProfileTargetRoles(profile)
            : [query];

    const mySkills = extractKeywords(getProfileSkills(profile));
    console.log(`Your skills: ${[...mySkills].slice(0, 20).join(", ")}...`);

    let all: { snippet?: string; title: string }[] = [];
    for (const q of queries) {
        const results = await scanJobs({ query: q, location: "any" });
        all = all.concat(results.jobs.map((j) => ({ snippet: j.snippet, title: j.title })));
    }

    // Deduplicate
    const seen = new Set<string>();
    const unique = all.filter((j) => {
        const key = `${j.title.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const jobs = unique.slice(0, limit);
    const jobKeywords = jobs.map((j) => ({
        job: j,
        keywords: extractKeywords(j.snippet || j.title),
    }));

    // Count demand across jobs
    const demand = new Map<string, number>();
    for (const { keywords } of jobKeywords) {
        for (const kw of keywords) {
            demand.set(kw, (demand.get(kw) || 0) + 1);
        }
    }

    // Gaps = demanded but not in my skills
    const gaps = [...demand.entries()]
        .filter(([kw]) => !mySkills.has(kw))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);

    console.log(`\nAnalyzed ${jobs.length} jobs. Top skill gaps:\n`);
    for (const [skill, count] of gaps) {
        console.log(
            `- ${skill} (mentioned in ${count} job${count > 1 ? "s" : ""})`,
        );
    }

    if (gaps.length === 0) {
        console.log(
            "No obvious skill gaps found based on scraped job snippets.",
        );
        return;
    }

    const gapList = gaps.map(([skill]) => skill).join(", ");

    const prompt = `I am a ${getProfileExperience(profile)} engineer with skills in ${getProfileSkills(profile)}.
I analyzed ${jobs.length} job postings and found these skill gaps (skills employers want but I don't have yet):
${gapList}

Create a prioritized learning plan in markdown with:
1. A heatmap table: Skill | Demand (out of ${jobs.length} jobs) | Priority | Estimated Time
2. For each gap, suggest ONE specific, high-quality free or low-cost resource (course, docs, project idea)
3. Order by priority (highest demand first)

Keep it concise and actionable. Do not invent fake course URLs.`;

    console.log("\nGenerating learning plan...\n");

    const content = await callCloudflareAI(prompt, env);
    console.log(content);
}
