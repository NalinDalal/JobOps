#!/usr/bin/env node

/**
 * discoverCompanies.mjs — Discover companies hiring on ATS boards
 * Uses Greenhouse/Lever/Ashby APIs to find companies with open roles.
 *
 * Usage:
 *   node scripts/discoverCompanies.mjs                     — Find 10 companies
 *   node scripts/discoverCompanies.mjs --ats greenhouse    — Only Greenhouse
 *   node scripts/discoverCompanies.mjs --query "react"     — Filter by skill
 *   node scripts/discoverCompanies.mjs --output data/discovered.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { loadActiveProfile } from "./lib/profile.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
function argVal(name, fallback) {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1 || idx === args.length - 1) return fallback;
    return args[idx + 1];
}

const ATS = argVal("ats", "greenhouse,lever,ashby")
    .split(",")
    .map((a) => a.trim());
const QUERY = argVal("query", "").toLowerCase();
const OUTPUT = argVal("output", "data/discovered.json");
const LIMIT = parseInt(argVal("limit", "50"), 10);

async function fetchWithTimeout(url, timeout = 10000) {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(timeout),
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function discoverGreenhouse() {
    // Well-known Greenhouse boards
    const boards = [
        "airbnb",
        "stripe",
        "figma",
        "notion",
        "linear",
        "vercel",
        "supabase",
        "planetscale",
        "railway",
        "render",
        "fly",
        "cloudflare",
        "twilio",
        "sendgrid",
        "hubspot",
        "salesforce",
        "dropbox",
        "slack",
        "discord",
        "spotify",
        "netlify",
        "heroku",
        "digitalocean",
        "gitlab",
        "github",
        "bitbucket",
        "atlassian",
        "mongodb",
        "elastic",
        "snowflake",
        "databricks",
        "openai",
        "anthropic",
        "cohere",
        "hugging",
        "replicate",
        "weights",
        "scale",
        "snorkel",
        "labelbox",
        "weightsandbiases",
        "neptune",
    ];

    const companies = [];

    for (const board of boards) {
        const data = await fetchWithTimeout(
            `https://boards-api.greenhouse.io/v1/boards/${board}/jobs`,
        );
        if (data?.jobs?.length) {
            const jobs = data.jobs.slice(0, 10).map((j) => ({
                title: j.title,
                url: j.absolute_url,
                location: j.location?.name || "Remote",
                department: j.departments?.[0]?.name || "",
                updated: j.updated_at,
            }));

            companies.push({
                name: board.charAt(0).toUpperCase() + board.slice(1),
                ats: "greenhouse",
                jobCount: data.jobs.length,
                jobs,
                url: `https://boards.greenhouse.io/${board}`,
            });
        }
    }

    return companies;
}

async function discoverLever() {
    // Well-known Lever boards
    const boards = [
        "airtable",
        "balance",
        "calendly",
        "canva",
        "cats",
        "clever",
        "codecademy",
        "codility",
        "duolingo",
        "figma",
        "gusto",
        "hashicorp",
        "lever",
        "mixpanel",
        "ned",
        "postman",
        "ramp",
        "robinhood",
        "shogun",
        "snap",
        "spotify",
        "upstart",
        "western",
        "ziprecruiter",
    ];

    const companies = [];

    for (const board of boards) {
        const data = await fetchWithTimeout(
            `https://api.lever.co/v0/postings/${board}?mode=json`,
        );
        if (Array.isArray(data) && data.length) {
            const jobs = data.slice(0, 10).map((j) => ({
                title: j.text,
                url: j.hostedUrl,
                location: j.categories?.location || "Remote",
                department: j.categories?.team || "",
                updated: j.createdAt,
            }));

            companies.push({
                name: board.charAt(0).toUpperCase() + board.slice(1),
                ats: "lever",
                jobCount: data.length,
                jobs,
                url: `https://jobs.lever.co/${board}`,
            });
        }
    }

    return companies;
}

async function discoverAshby() {
    // Well-known Ashby boards
    const boards = [
        "postman",
        "linear",
        "vercel",
        "supabase",
        "planetscale",
        "railway",
        "render",
        "fly",
        "cloudflare",
        "twilio",
        "sendgrid",
        "hubspot",
        "salesforce",
        "dropbox",
        "slack",
        "discord",
        "spotify",
        "netlify",
        "heroku",
        "digitalocean",
        "gitlab",
        "github",
        "bitbucket",
        "atlassian",
    ];

    const companies = [];

    for (const board of boards) {
        const data = await fetchWithTimeout(
            `https://api.ashbyhq.com/posting-api/job-board/${board}`,
        );
        if (data?.jobs?.length) {
            const jobs = data.jobs.slice(0, 10).map((j) => ({
                title: j.title,
                url: j.jobUrl,
                location: j.locationName || "Remote",
                department: j.teamName || "",
                updated: j.publishedAt,
            }));

            companies.push({
                name: board.charAt(0).toUpperCase() + board.slice(1),
                ats: "ashby",
                jobCount: data.jobs.length,
                jobs,
                url: `https://jobs.ashbyhq.com/${board}`,
            });
        }
    }

    return companies;
}

async function main() {
    const profile = loadActiveProfile();

    console.log(`\n Discovering companies on: ${ATS.join(", ")}\n`);

    const allCompanies = [];

    if (ATS.includes("greenhouse")) {
        console.log("Searching Greenhouse...");
        const gh = await discoverGreenhouse();
        allCompanies.push(...gh);
        console.log(`  Found ${gh.length} companies`);
    }

    if (ATS.includes("lever")) {
        console.log("Searching Lever...");
        const lv = await discoverLever();
        allCompanies.push(...lv);
        console.log(`  Found ${lv.length} companies`);
    }

    if (ATS.includes("ashby")) {
        console.log("Searching Ashby...");
        const ab = await discoverAshby();
        allCompanies.push(...ab);
        console.log(`  Found ${ab.length} companies`);
    }

    // Filter by query if specified
    let filtered = allCompanies;
    if (QUERY) {
        filtered = allCompanies.filter((c) => {
            const matchTitle = c.jobs.some((j) =>
                j.title.toLowerCase().includes(QUERY),
            );
            const matchDept = c.jobs.some((j) =>
                j.department.toLowerCase().includes(QUERY),
            );
            return matchTitle || matchDept;
        });
        console.log(
            `\nFiltered to ${filtered.length} companies matching "${QUERY}"`,
        );
    }

    // Sort by job count
    filtered.sort((a, b) => b.jobCount - a.jobCount);

    const results = filtered.slice(0, LIMIT);

    console.log(`\n Top ${results.length} companies:\n`);
    results.forEach((c, i) => {
        console.log(
            `  ${i + 1}. ${c.name} (${c.ats}) — ${c.jobCount} open roles`,
        );
        c.jobs.slice(0, 3).forEach((j) => {
            console.log(`     • ${j.title} — ${j.location}`);
        });
        console.log(`     ${c.url}`);
    });

    // Save results
    const outPath = resolve(ROOT, OUTPUT);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\n Saved to: ${outPath}`);

    // Generate config snippet
    console.log("\n Add to config/portals.yml:\n");
    console.log("greenhouse:");
    console.log("  boards:");
    results
        .filter((c) => c.ats === "greenhouse")
        .forEach((c) => {
            console.log(
                `    - {slug: ${c.name.toLowerCase()}, name: "${c.name}"}`,
            );
        });
    console.log("\nlever:");
    console.log("  boards:");
    results
        .filter((c) => c.ats === "lever")
        .forEach((c) => {
            console.log(
                `    - {slug: ${c.name.toLowerCase()}, name: "${c.name}"}`,
            );
        });
    console.log("\nashby:");
    console.log("  boards:");
    results
        .filter((c) => c.ats === "ashby")
        .forEach((c) => {
            console.log(
                `    - {slug: ${c.name.toLowerCase()}, name: "${c.name}"}`,
            );
        });
}

main().catch((e) => {
    console.error(`Discovery failed: ${e.message}`);
    process.exit(1);
});
