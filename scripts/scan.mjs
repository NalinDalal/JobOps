#!/usr/bin/env node

/**
 * scan.mjs — Multi-portal job scanner
 * Searches RemoteOK, Arbeitnow, Findwork, Remotive, freehire,
 * Greenhouse, Lever, Ashby for matching jobs.
 *
 * Usage:
 *   node scripts/scan.mjs "software engineer" "Remote"
 *   node scripts/scan.mjs auto "Remote"        — derive queries from config/profile.yml target_roles
 *   node scripts/scan.mjs --mock               — use mock data for testing
 *   node scripts/scan.mjs --config             — show loaded config
 * Output: JSON array of job listings
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { load as yamlLoad } from "js-yaml";
import {
    loadActiveProfile,
    getProfileSkills,
    getProfileTargetRoles,
    getProfileTargetLocations,
} from "./lib/profile.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Parse args
const args = process.argv.slice(2);
const MOCK_MODE = args.includes("--mock");
const SHOW_CONFIG = args.includes("--config");
const QUERY = args.find((a) => !a.startsWith("--")) || "software engineer";
const LOCATION =
    args.find(
        (a, i) => !a.startsWith("--") && args[i - 1] !== "--mock" && i > 0,
    ) || "Remote";

const fetchT = (url, opts = {}, ms = 15000) =>
    fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });

const jobs = [];
const blacklist = new Set();
const whitelist = new Set();
let blacklistEnabled = true;
let whitelistEnabled = false;
let searchQueries = [];
let greenhouseBoards = [];
let leverBoards = [];
let ashbyBoards = [];

// Search config from search.yml
let searchConfig = {
    include_titles: [],
    exclude_titles: [],
    locations: [],
    allow_remote: true,
    max_age_days: 30,
    score_threshold: 3.5,
    max_per_digest: 10,
    portals: {
        api_portals: true,
        greenhouse: true,
        lever: true,
        ashby: true,
        linkedin: true,
        instahyre: true,
        wellfound: true,
    },
    query_mode: "auto",
    custom_query: "",
    mock_mode: false,
};

// ─── Load YAML helper ────────────────────────────────────────────
function loadYaml(path) {
    try {
        if (!existsSync(path)) return {};
        return yamlLoad(readFileSync(path, "utf-8")) || {};
    } catch (e) {
        console.warn(`Could not parse ${path}: ${e.message}`);
        return {};
    }
}

// ─── Load portals.yml ────────────────────────────────────────────
function loadPortalsConfig() {
    const cfg = loadYaml(resolve(ROOT, "config/portals.yml"));

    const bl = cfg.blacklist || {};
    blacklistEnabled = bl.enabled !== false;
    for (const c of bl.companies || []) blacklist.add(String(c).toLowerCase());

    const wl = cfg.whitelist || {};
    whitelistEnabled = wl.enabled === true;
    for (const c of wl.companies || []) whitelist.add(String(c).toLowerCase());

    searchQueries = (cfg.search_queries || [])
        .filter((q) => q && q.query && q.enabled !== false)
        .map((q) => q.query);

    greenhouseBoards = (cfg.greenhouse?.boards || [])
        .map((b) => b.slug)
        .filter(Boolean);
    leverBoards = (cfg.lever?.boards || []).map((b) => b.slug).filter(Boolean);
    ashbyBoards = (cfg.ashby?.boards || []).map((b) => b.slug).filter(Boolean);
}

// ─── Load search.yml ─────────────────────────────────────────────
function loadSearchConfig() {
    const cfg = loadYaml(resolve(ROOT, "config/search.yml"));

    searchConfig = {
        include_titles: cfg.include_titles || [],
        exclude_titles: cfg.exclude_titles || [],
        locations: cfg.locations || [],
        allow_remote: cfg.allow_remote !== false,
        max_age_days: cfg.max_age_days || 30,
        score_threshold: cfg.score_threshold || 3.5,
        max_per_digest: cfg.max_per_digest || 10,
        portals: cfg.portals || {
            api_portals: true,
            greenhouse: true,
            lever: true,
            ashby: true,
            linkedin: true,
            instahyre: true,
            wellfound: true,
        },
        query_mode: cfg.query_mode || "auto",
        custom_query: cfg.custom_query || "",
        mock_mode: cfg.mock_mode || false,
    };
}

function isBlacklisted(company) {
    if (!blacklistEnabled) return false;
    const lower = company.toLowerCase();
    if (whitelistEnabled && whitelist.size > 0) {
        return !Array.from(whitelist).some((w) => lower.includes(w));
    }
    return Array.from(blacklist).some((b) => lower.includes(b));
}

// ─── Auto queries from active profile ────────────────────────────
function autoQueries() {
    const profile = loadActiveProfile();
    const roles = getProfileTargetRoles(profile);
    return roles;
}

function matchesSearch(text) {
    const activeQuery = globalThis.__query || QUERY;
    const searchLower = activeQuery.toLowerCase();
    const textLower = text.toLowerCase();

    // Check for negative keywords (company blacklist)
    const hasNegative =
        blacklistEnabled &&
        Array.from(blacklist).some((b) => textLower.includes(b));
    if (hasNegative) return false;

    return textLower.includes(searchLower);
}

// ─── Title filter using search.yml include/exclude ───────────────
function matchesTitleFilter(title, snippet) {
    const titleLower = title.toLowerCase();

    // Check exclude first (negative filter) against title
    for (const excl of searchConfig.exclude_titles) {
        if (titleLower.includes(excl.toLowerCase())) return false;
    }

    // Also check snippet for experience-based exclusions
    if (snippet) {
        const snippetLower = snippet.toLowerCase();
        const experiencePatterns = [
            /(\d+)\+?\s*years?\s*(of\s*)?(experience|professional|relevant)/i,
            /experience\s*:\s*(\d+)\+?\s*years?/i,
            /minimum\s*(of\s*)?(\d+)\+?\s*years?/i,
            /at\s*least\s*(\d+)\+?\s*years?/i,
        ];
        for (const pattern of experiencePatterns) {
            const match = snippet.match(pattern);
            if (match) {
                const years = parseInt(match[1] || match[2], 10);
                if (years >= 5) return false; // Skip roles requiring 5+ years
            }
        }
    }

    // Check include (positive filter) - if list not empty, must match at least one
    if (searchConfig.include_titles.length > 0) {
        let matched = false;
        for (const incl of searchConfig.include_titles) {
            if (titleLower.includes(incl.toLowerCase())) {
                matched = true;
                break;
            }
        }
        if (!matched) return false;
    }

    return true;
}

// ─── Skill filter — exclude jobs requiring skills user doesn't have ─
function matchesSkillFilter(title, snippet, tags) {
    const profile = loadActiveProfile();
    const userSkills = getProfileSkills(profile).toLowerCase();

    // Hard-skill keywords that trigger exclusion if mentioned as primary requirement
    // Only block if the skill is prominently mentioned (title, first-line, or as a tag)
    const hardSkills = [
        "java",
        "c#",
        "csharp",
        "go",
        "golang",
        "scala",
        "kotlin",
        "swift",
        "objective-c",
        "ruby",
        "php",
        "perl",
        "r language",
        ".net",
        "dotnet",
        "spring boot",
        "django",
        "flask",
        "objective c",
        "ios developer",
        "android developer",
        "flutter",
        "react native",
        "xamarin",
    ];

    // Check title — if title contains a hard skill not in user's profile, exclude
    const titleLower = (title || "").toLowerCase();
    for (const skill of hardSkills) {
        if (userSkills.includes(skill)) continue; // user has this skill, skip
        // Title match is strong signal — exclude
        if (titleLower.includes(skill)) return false;
    }

    // Check tags — tags are explicit skill requirements
    for (const tag of tags || []) {
        const tagLower = tag.toLowerCase().trim();
        if (!tagLower) continue;
        // If tag matches a known hard skill and user doesn't have it, exclude
        for (const skill of hardSkills) {
            if (userSkills.includes(skill)) continue;
            if (tagLower === skill || tagLower.includes(skill)) return false;
        }
    }

    return true;
}

// ─── Location filter using search.yml ────────────────────────────
function matchesLocationFilter(location) {
    const locLower = location.toLowerCase();

    // Allow remote if configured
    if (
        searchConfig.allow_remote &&
        (locLower === "remote" || locLower.includes("remote"))
    )
        return true;

    // Check against configured locations (partial match)
    for (const loc of searchConfig.locations) {
        if (locLower.includes(loc.toLowerCase())) return true;
    }

    // If location is "Not specified" or empty, allow it (might be remote)
    if (!locLower || locLower === "not specified" || locLower === "anywhere")
        return true;

    return false;
}

// ─── Age filter ──────────────────────────────────────────────────
function isFreshEnough(posted) {
    if (searchConfig.max_age_days <= 0) return true;
    if (!posted || posted === "Unknown") return true; // Keep unknown dates

    const postedDate = new Date(posted);
    if (isNaN(postedDate.getTime())) return true;

    const now = new Date();
    const diffDays = (now - postedDate) / (1000 * 60 * 60 * 24);
    return diffDays <= searchConfig.max_age_days;
}

// ─── Mock data generator ─────────────────────────────────────────
function generateMockJobs() {
    const mockJobs = [
        {
            title: "Software Engineer",
            company: "Stripe",
            location: "San Francisco, CA (Remote OK)",
            url: "https://boards.greenhouse.io/stripe/jobs/123456",
            source: "greenhouse:stripe",
            tags: ["React", "TypeScript", "Node.js", "AWS"],
            snippet:
                "Build scalable payment infrastructure. Work with React, TypeScript, and distributed systems.",
            posted: new Date().toISOString().split("T")[0],
        },
        {
            title: "Full Stack Developer",
            company: "Vercel",
            location: "Remote",
            url: "https://boards.greenhouse.io/vercel/jobs/789012",
            source: "greenhouse:vercel",
            tags: ["Next.js", "React", "TypeScript", "Edge Functions"],
            snippet:
                "Build the future of frontend infrastructure. Experience with Next.js and React required.",
            posted: new Date().toISOString().split("T")[0],
        },
        {
            title: "Backend Engineer",
            company: "Supabase",
            location: "Remote",
            url: "https://jobs.lever.co/supabase/abc123",
            source: "lever:supabase",
            tags: ["PostgreSQL", "TypeScript", "Rust", "AWS"],
            snippet:
                "Build open-source Firebase alternative. Strong PostgreSQL and TypeScript skills needed.",
            posted: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0],
        },
        {
            title: "Frontend Engineer",
            company: "Linear",
            location: "Remote",
            url: "https://jobs.ashbyhq.com/linear/xyz789",
            source: "ashby:linear",
            tags: ["React", "TypeScript", "GraphQL", "Electron"],
            snippet:
                "Build delightful issue tracking. React, TypeScript, and GraphQL experience preferred.",
            posted: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0],
        },
        {
            title: "Junior Software Engineer",
            company: "Railway",
            location: "Remote",
            url: "https://boards.greenhouse.io/railway/jobs/456789",
            source: "greenhouse:railway",
            tags: ["Node.js", "TypeScript", "Docker", "Kubernetes"],
            snippet:
                "Deploy infrastructure with ease. Entry-level role with mentorship.",
            posted: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0],
        },
    ];

    return mockJobs.map((j, i) => ({ ...j, id: i + 1 }));
}

// ─── RemoteOK ────────────────────────────────────────────────────
async function scanRemoteOK() {
    if (MOCK_MODE || searchConfig.mock_mode) return;

    try {
        const res = await fetchT("https://remoteok.com/api", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data)) return;

        for (const item of data.slice(1)) {
            if (!item.position || !item.company) continue;
            if (isBlacklisted(item.company)) continue;
            if (
                !matchesSearch(
                    `${item.position} ${item.company} ${(item.tags || []).join(" ")}`,
                )
            )
                continue;

            const posted = item.epoch
                ? new Date(item.epoch * 1000).toISOString().split("T")[0]
                : "Unknown";
            if (!isFreshEnough(posted)) continue;

            jobs.push({
                id: jobs.length + 1,
                title: item.position,
                company: item.company,
                location: item.location || "Remote",
                url: `https://remoteok.com/remote-jobs/${item.id}`,
                source: "remoteok",
                tags: item.tags || [],
                snippet: (item.description || "")
                    .replace(/<[^>]*>/g, "")
                    .substring(0, 300),
                posted,
            });
        }
    } catch (e) {
        console.error(`RemoteOK error: ${e.message}`);
    }
}

// ─── Arbeitnow ───────────────────────────────────────────────────
async function scanArbeitnow() {
    if (MOCK_MODE || searchConfig.mock_mode) return;

    try {
        const res = await fetchT("https://www.arbeitnow.com/api/job-board-api");
        if (!res.ok) return;
        const data = await res.json();
        if (!data.data) return;

        for (const item of data.data) {
            if (isBlacklisted(item.company_name)) continue;
            if (
                !matchesSearch(
                    `${item.title} ${item.company_name} ${(item.tags || []).join(" ")}`,
                )
            )
                continue;

            const posted = item.created_at
                ? new Date(
                      typeof item.created_at === "number"
                          ? item.created_at * 1000
                          : item.created_at,
                  )
                      .toISOString()
                      .split("T")[0]
                : "Unknown";
            if (!isFreshEnough(posted)) continue;

            jobs.push({
                id: jobs.length + 1,
                title: item.title,
                company: item.company_name,
                location: item.remote
                    ? "Remote"
                    : item.location || "Not specified",
                url: item.url,
                source: "arbeitnow",
                tags: item.tags || [],
                snippet: (item.description || "")
                    .replace(/<[^>]*>/g, "")
                    .substring(0, 300),
                posted,
            });
        }
    } catch (e) {
        console.error(`Arbeitnow error: ${e.message}`);
    }
}

// ─── Findwork ────────────────────────────────────────────────────
async function scanFindwork() {
    if (MOCK_MODE || searchConfig.mock_mode) return;

    try {
        const res = await fetchT("https://findwork.dev/api/jobs/", {
            headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.results) return;

        for (const item of data.results) {
            if (isBlacklisted(item.company_name)) continue;
            if (
                !matchesSearch(
                    `${item.role} ${item.company_name} ${(item.keywords || []).join(" ")}`,
                )
            )
                continue;

            const posted = item.date_posted || "Unknown";
            if (!isFreshEnough(posted)) continue;

            jobs.push({
                id: jobs.length + 1,
                title: item.role,
                company: item.company_name,
                location: item.location || "Remote",
                url: item.url,
                source: "findwork",
                tags: item.keywords || [],
                snippet: (item.text || "")
                    .replace(/<[^>]*>/g, "")
                    .substring(0, 300),
                posted,
            });
        }
    } catch (e) {
        console.error(`Findwork error: ${e.message}`);
    }
}

// ─── Remotive ────────────────────────────────────────────────────
async function scanRemotive() {
    if (MOCK_MODE || searchConfig.mock_mode) return;

    try {
        const res = await fetchT(
            `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(QUERY)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!data.jobs) return;

        for (const item of data.jobs) {
            if (isBlacklisted(item.company_name)) continue;
            if (
                !matchesSearch(
                    `${item.title} ${item.company_name} ${(item.tags || []).join(" ")}`,
                )
            )
                continue;

            const posted = item.publication_date
                ? item.publication_date.split("T")[0]
                : "Unknown";
            if (!isFreshEnough(posted)) continue;

            jobs.push({
                id: jobs.length + 1,
                title: item.title,
                company: item.company_name,
                location: item.candidate_required_location || "Remote",
                url: item.url,
                source: "remotive",
                tags: item.tags || [],
                snippet: (item.description || "")
                    .replace(/<[^>]*>/g, "")
                    .substring(0, 300),
                posted,
            });
        }
    } catch (e) {
        console.error(`Remotive error: ${e.message}`);
    }
}

// ─── freehire ────────────────────────────────────────────────────
async function scanFreehire() {
    if (MOCK_MODE || searchConfig.mock_mode) return;

    try {
        const res = await fetchT(
            `https://freehire.me/api/v1/jobs?q=${encodeURIComponent(QUERY)}&remote=true`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!data.jobs) return;

        for (const item of data.jobs) {
            if (isBlacklisted(item.company)) continue;
            if (
                !matchesSearch(
                    `${item.title} ${item.company} ${(item.skills || []).join(" ")}`,
                )
            )
                continue;

            const posted = item.posted_at
                ? item.posted_at.split("T")[0]
                : "Unknown";
            if (!isFreshEnough(posted)) continue;

            jobs.push({
                id: jobs.length + 1,
                title: item.title,
                company: item.company,
                location: item.remote
                    ? "Remote"
                    : item.location || "Not specified",
                url: item.url || `https://freehire.me/jobs/${item.id}`,
                source: "freehire",
                tags: item.skills || [],
                snippet: item.description
                    ? item.description.replace(/<[^>]*>/g, "").substring(0, 300)
                    : "",
                posted,
            });
        }
    } catch (e) {
        console.error(`freehire error: ${e.message}`);
    }
}

// ─── Greenhouse ──────────────────────────────────────────────────
async function scanGreenhouse(slug) {
    if (MOCK_MODE || searchConfig.mock_mode) return;
    if (!searchConfig.portals.greenhouse) return;

    try {
        const res = await fetchT(
            `https://api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!data.jobs) return;

        for (const item of data.jobs) {
            if (isBlacklisted(item.company_name || item.company || ""))
                continue;
            if (
                !matchesSearch(
                    `${item.title} ${item.company_name || item.company || ""} ${(item.tags || []).join(" ")}`,
                )
            )
                continue;

            const posted = item.updated_at
                ? item.updated_at.split("T")[0]
                : "Unknown";
            if (!isFreshEnough(posted)) continue;

            jobs.push({
                id: jobs.length + 1,
                title: item.title,
                company: item.company_name || item.company || slug,
                location: item.location ? item.location.name : "Not specified",
                url:
                    item.absolute_url ||
                    item.url ||
                    `https://boards.greenhouse.io/${slug}/jobs/${item.id}`,
                source: `greenhouse:${slug}`,
                tags: item.tags || [],
                snippet: item.content
                    ? item.content.replace(/<[^>]*>/g, "").substring(0, 300)
                    : "",
                posted,
            });
        }
    } catch (e) {
        console.error(`Greenhouse ${slug} error: ${e.message}`);
    }
}

// ─── Lever ───────────────────────────────────────────────────────
async function scanLever(slug) {
    if (MOCK_MODE || searchConfig.mock_mode) return;
    if (!searchConfig.portals.lever) return;

    try {
        const res = await fetchT(
            `https://api.lever.co/v0/postings/${slug}?mode=json`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data)) return;

        for (const item of data) {
            if (isBlacklisted(item.company || "")) continue;
            const categories = item.categories || {};
            if (
                !matchesSearch(
                    `${item.text} ${item.title} ${categories.commitment || ""} ${categories.team || ""} ${categories.location || ""}`,
                )
            )
                continue;

            const posted = item.createdAt
                ? item.createdAt.split("T")[0]
                : "Unknown";
            if (!isFreshEnough(posted)) continue;

            jobs.push({
                id: jobs.length + 1,
                title: item.text || item.title,
                company: item.company || slug,
                location: categories.location || "Not specified",
                url:
                    item.hostedUrl ||
                    `https://jobs.lever.co/${slug}/${item.id}`,
                source: `lever:${slug}`,
                tags: [
                    categories.team,
                    categories.commitment,
                    categories.location,
                ].filter(Boolean),
                snippet: item.description
                    ? item.description.replace(/<[^>]*>/g, "").substring(0, 300)
                    : "",
                posted,
            });
        }
    } catch (e) {
        console.error(`Lever ${slug} error: ${e.message}`);
    }
}

// ─── Ashby ───────────────────────────────────────────────────────
async function scanAshby(slug) {
    if (MOCK_MODE || searchConfig.mock_mode) return;
    if (!searchConfig.portals.ashby) return;

    try {
        const res = await fetchT(
            `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!data.jobs) return;

        for (const item of data.jobs) {
            const company = item.organization || item.company || slug;
            if (isBlacklisted(company)) continue;
            if (
                !matchesSearch(
                    `${item.title} ${company} ${(item.tags || []).join(" ")} ${item.location || ""}`,
                )
            )
                continue;

            const posted =
                item.publishedAt || item.publishedDate || item.createdAt
                    ? String(
                          item.publishedAt ||
                              item.publishedDate ||
                              item.createdAt,
                      ).split("T")[0]
                    : "Unknown";
            if (!isFreshEnough(posted)) continue;

            jobs.push({
                id: jobs.length + 1,
                title: item.title,
                company: company,
                location: item.location || "Not specified",
                url: item.jobUrl || `https://jobs.ashbyhq.com/${slug}`,
                source: `ashby:${slug}`,
                tags: item.tags || [],
                snippet: item.description
                    ? item.description.replace(/<[^>]*>/g, "").substring(0, 300)
                    : "",
                posted,
            });
        }
    } catch (e) {
        console.error(`Ashby ${slug} error: ${e.message}`);
    }
}

// ─── LinkedIn (guest/public job listings) ────────────────────────
async function scanLinkedIn() {
    if (MOCK_MODE || searchConfig.mock_mode) return;
    if (!searchConfig.portals.linkedin) return;

    try {
        const searchQ = globalThis.__query || "software engineer";
        const location = globalThis.__location || "";

        // LinkedIn public jobs search (no auth required, low volume)
        const params = new URLSearchParams({
            keywords: searchQ,
            location: location || "India",
            f_TPR: "r604800", // Last 7 days
            f_E: "2", // Entry level
            f_JT: "F", // Full-time
        });

        const res = await fetchT(
            `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    Accept: "text/html",
                },
            },
        );

        if (!res.ok) return;
        const html = await res.text();

        // Parse job cards from HTML
        const cardRegex =
            /<li[^>]*class="[^"]*result-card[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
        const titleRegex =
            /<h3[^>]*class="[^"]*result-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/;
        const companyRegex =
            /<h4[^>]*class="[^"]*result-card__company[^"]*"[^>]*>([\s\S]*?)<\/h4>/;
        const locationRegex =
            /<span[^>]*class="[^"]*job-result__location[^"]*"[^>]*>([\s\S]*?)<\/span>/;
        const linkRegex =
            /<a[^>]*href="([^"]*)"[^>]*class="[^"]*result-card__full-card-link[^"]*"/;
        const dateRegex =
            /<time[^>]*class="[^"]*result-card__date[^"]*"[^>]*datetime="([^"]*)"/;

        let match;
        while ((match = cardRegex.exec(html)) !== null) {
            const card = match[1];

            const titleMatch = card.match(titleRegex);
            const companyMatch = card.match(companyRegex);
            const locationMatch = card.match(locationRegex);
            const linkMatch = card.match(linkRegex);
            const dateMatch = card.match(dateRegex);

            if (!titleMatch || !companyMatch) continue;

            const title = titleMatch[1].replace(/<[^>]*>/g, "").trim();
            const company = companyMatch[1].replace(/<[^>]*>/g, "").trim();
            const loc = locationMatch
                ? locationMatch[1].replace(/<[^>]*>/g, "").trim()
                : "Not specified";
            const url = linkMatch ? linkMatch[1] : "";
            const posted = dateMatch ? dateMatch[1].split("T")[0] : "Unknown";

            if (isBlacklisted(company)) continue;
            if (!matchesSearch(`${title} ${company} ${loc}`)) continue;
            if (!isFreshEnough(posted)) continue;

            jobs.push({
                id: jobs.length + 1,
                title,
                company,
                location: loc,
                url: url.startsWith("http")
                    ? url
                    : `https://www.linkedin.com${url}`,
                source: "linkedin",
                tags: [],
                snippet: "",
                posted,
            });
        }
    } catch (e) {
        console.error(`LinkedIn error: ${e.message}`);
    }
}

// ─── Instahyre (India-focused) ───────────────────────────────────
async function scanInstahyre() {
    if (MOCK_MODE || searchConfig.mock_mode) return;
    if (!searchConfig.portals.instahyre) return;

    try {
        // Instahyre public job listing API
        const res = await fetchT(
            "https://api.instahyre.com/api/v1/jobs?page=1&limit=50",
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                    Accept: "application/json",
                },
            },
        );
        if (!res.ok) return;
        const data = await res.json();
        const items = data.jobs || data.data || data || [];
        if (!Array.isArray(items)) return;

        for (const item of items) {
            const company = item.company_name || item.company || "";
            if (isBlacklisted(company)) continue;

            const title = item.title || item.job_title || "";
            const location = item.location || item.city || "India";
            if (!matchesSearch(`${title} ${company} ${location}`)) continue;

            const posted = item.created_at
                ? new Date(item.created_at).toISOString().split("T")[0]
                : "Unknown";
            if (!isFreshEnough(posted)) continue;

            jobs.push({
                id: jobs.length + 1,
                title,
                company,
                location,
                url:
                    item.job_url ||
                    item.url ||
                    `https://instahyre.com/job/${item.id}`,
                source: "instahyre",
                tags: item.skills || item.tags || [],
                snippet: item.description
                    ? item.description.replace(/<[^>]*>/g, "").substring(0, 300)
                    : "",
                posted,
            });
        }
    } catch (e) {
        console.error(`Instahyre error: ${e.message}`);
    }
}

// ─── Wellfound (AngelList) ──────────────────────────────────────
async function scanWellfound() {
    if (MOCK_MODE || searchConfig.mock_mode) return;
    if (!searchConfig.portals.wellfound) return;

    try {
        // Wellfound GraphQL API for job listings
        const query = `
      query JobSearchQuery($query: String!) {
        jobSearch(input: { query: $query, first: 50 }) {
          edges {
            node {
              id
              title
              slug
              company {
                name
                slug
              }
              locations
              remote
              postedAt
              description
            }
          }
        }
      }
    `;

        const searchQ = globalThis.__query || "software engineer";
        const res = await fetchT("https://wellfound.com/graphql", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            },
            body: JSON.stringify({
                query,
                variables: { query: searchQ },
            }),
        });

        if (!res.ok) return;
        const data = await res.json();
        const edges = data?.data?.jobSearch?.edges || [];

        for (const edge of edges) {
            const item = edge.node;
            if (!item) continue;

            const company = item.company?.name || "";
            if (isBlacklisted(company)) continue;

            const title = item.title || "";
            const locs = item.locations || [];
            const location = item.remote
                ? "Remote"
                : locs[0] || "Not specified";

            if (!matchesSearch(`${title} ${company} ${locs.join(" ")}`))
                continue;

            const posted = item.postedAt
                ? new Date(item.postedAt).toISOString().split("T")[0]
                : "Unknown";
            if (!isFreshEnough(posted)) continue;

            jobs.push({
                id: jobs.length + 1,
                title,
                company,
                location,
                url: `https://wellfound.com/jobs/${item.slug}`,
                source: "wellfound",
                tags: [],
                snippet: item.description
                    ? item.description.replace(/<[^>]*>/g, "").substring(0, 300)
                    : "",
                posted,
            });
        }
    } catch (e) {
        console.error(`Wellfound error: ${e.message}`);
    }
}

// ─── Scan all boards ─────────────────────────────────────────────
async function scanAllBoards(boards, scanFn) {
    await Promise.allSettled(boards.map((slug) => scanFn(slug)));
}

// ─── Main scan function ──────────────────────────────────────────
async function scanOnce(q, loc) {
    globalThis.__query = q;
    globalThis.__location = loc || "";
    jobs.length = 0;

    const tasks = [];

    if (searchConfig.portals.api_portals) {
        tasks.push(
            scanRemoteOK(),
            scanArbeitnow(),
            scanFindwork(),
            scanRemotive(),
            scanFreehire(),
        );
    }
    if (searchConfig.portals.greenhouse)
        tasks.push(scanAllBoards(greenhouseBoards, scanGreenhouse));
    if (searchConfig.portals.lever)
        tasks.push(scanAllBoards(leverBoards, scanLever));
    if (searchConfig.portals.ashby)
        tasks.push(scanAllBoards(ashbyBoards, scanAshby));
    if (searchConfig.portals.linkedin) tasks.push(scanLinkedIn());
    if (searchConfig.portals.instahyre) tasks.push(scanInstahyre());
    if (searchConfig.portals.wellfound) tasks.push(scanWellfound());

    await Promise.allSettled(tasks);
    const results = jobs.slice();
    jobs.length = 0;
    return results;
}

async function main() {
    loadPortalsConfig();
    loadSearchConfig();

    if (MOCK_MODE) searchConfig.mock_mode = true;

    if (SHOW_CONFIG) {
        console.log("Loaded search config:");
        console.log(JSON.stringify(searchConfig, null, 2));
        return;
    }

    if (searchConfig.mock_mode) {
        console.log(" Mock mode enabled - using sample data");
    }

    const location = LOCATION;
    let queries;

    if (searchConfig.query_mode === "auto" || QUERY.toLowerCase() === "auto") {
        const merged = [...autoQueries(), ...searchQueries]
            .map((q) => q.trim().toLowerCase())
            .filter(Boolean);
        queries = [...new Set(merged)];
    } else if (searchConfig.custom_query) {
        queries = [searchConfig.custom_query];
    } else {
        queries = [QUERY];
    }

    if (whitelistEnabled) {
        console.log(`  Whitelist mode: only ${whitelist.size} companies`);
    } else if (blacklistEnabled) {
        console.log(`  Blacklist mode: ${blacklist.size} companies excluded`);
    }

    let all = [];
    for (const q of queries) {
        console.log(`Scanning for: "${q}" in "${location}"...`);
        const results = await scanOnce(q, location);
        console.log(`  -> ${results.length} raw matches`);
        all = all.concat(results);
    }

    // Add mock jobs if in mock mode
    if (MOCK_MODE || searchConfig.mock_mode) {
        const mockJobs = generateMockJobs();
        console.log(`  -> Adding ${mockJobs.length} mock jobs`);
        all = all.concat(mockJobs);
    }

    // Deduplicate by title+company
    const seen = new Set();
    const unique = all.filter((j) => {
        const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Title filter using search.yml include/exclude (also checks snippet for experience)
    const filtered = unique.filter((j) =>
        matchesTitleFilter(j.title, j.snippet),
    );

    // Skill filter — exclude jobs requiring skills user doesn't have
    const skilled = filtered.filter((j) =>
        matchesSkillFilter(j.title, j.snippet, j.tags),
    );

    // Location filter using search.yml
    const located = skilled.filter((j) => matchesLocationFilter(j.location));

    // Re-number
    located.forEach((j, i) => (j.id = i + 1));

    console.log(`\nFilters applied:`);
    console.log(`  Title filter: ${unique.length} → ${filtered.length}`);
    console.log(`  Skill filter: ${filtered.length} → ${skilled.length}`);
    console.log(`  Location filter: ${skilled.length} → ${located.length}`);
    console.log(`\nFound ${located.length} jobs:\n`);
    console.log(JSON.stringify(located, null, 2));
}

main();
