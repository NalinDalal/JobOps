/**
 * lib/viewModel.ts — Digest ViewModel builder
 *
 * Transforms Job[] into DigestViewModel — the contract between data and renderer.
 */

import type {
    Job,
    DigestViewModel,
    DigestMatch,
    DigestSummary,
    MatchScore,
    AcceleratorResearchSection,
} from "./types";
import { scoreToVerdict, topLabel } from "./types";
import {
    loadActiveProfile,
    getProfileSkills,
    getProfileTargetRoles,
    getProfileTargetLocations,
    getProfileCandidate,
    getProfileExperience,
    getProfileOutreach,
} from "./config";
import { normalizeLocation, truncate } from "./text";
import { SCORE_STRONG, SCORE_REVIEW, TRUNCATE_DEFAULT } from "./constants";
import type {
    ViewModelOptions,
    OutreachGroup,
    PeopleSearchUrl,
    SkillSignal,
    WhyJobOpsSection,
    YourMoveAction,
} from "./types";

// ─── Keyword extraction ───────────────────────────────────────

const STOP_WORDS = new Set([
    "the",
    "and",
    "for",
    "with",
    "you",
    "your",
    "are",
    "has",
    "have",
    "this",
    "that",
    "will",
    "can",
    "our",
    "job",
    "role",
    "team",
    "work",
    "working",
    "looking",
    "seeking",
    "candidate",
    "experience",
    "years",
    "year",
    "strong",
    "excellent",
    "good",
    "knowledge",
    "using",
    "use",
    "used",
    "etc",
    "including",
    "well",
    "able",
    "must",
    "requirements",
    "required",
    "preferred",
    "plus",
    "bonus",
    "qualifications",
    "skills",
    "responsibilities",
]);

function extractJDKeywords(text: string): string[] {
    if (!text) return [];
    const lower = String(text).toLowerCase();
    const tokens = new Set<string>();
    for (const m of lower.matchAll(/[a-z][a-z0-9+#.\-]{2,}/g)) {
        const t = m[0];
        if (!STOP_WORDS.has(t) && t.length >= 3) tokens.add(t);
    }
    return [...tokens].slice(0, 30);
}

// ─── Skill matching ───────────────────────────────────────────

const WEB_PRIORITY_SKILLS = [
    "typescript",
    "javascript",
    "react",
    "next",
    "node",
    "tailwind css",
    "elysia",
    "express",
    "postgresql",
    "prisma",
    "mongodb",
    "redis",
    "docker",
    "kubernetes",
    "aws",
    "github actions",
    "bun",
    "jest",
    "bash",
    "linux",
];

function matchSkillsToJob(job: Job, allSkills: string[]): string[] {
    const jdTokens = new Set(
        extractJDKeywords(
            `${job.title} ${job.snippet || ""} ${(job.tags || []).join(" ")}`,
        ),
    );
    const matched: string[] = [];
    for (const skill of allSkills) {
        const s = skill.toLowerCase();
        if (
            jdTokens.has(s) ||
            `${job.title} ${job.snippet || ""}`.toLowerCase().includes(s)
        ) {
            matched.push(skill);
        }
    }
    return matched;
}

function pickRelevantFallbackSkills(allSkills: string[]): string[] {
    const lower = allSkills.map((s) => s.toLowerCase());
    const picked: string[] = [];
    for (const priority of WEB_PRIORITY_SKILLS) {
        const idx = lower.indexOf(priority);
        if (idx !== -1 && !picked.includes(allSkills[idx]!)) {
            picked.push(allSkills[idx]!);
            if (picked.length >= 3) break;
        }
    }
    if (picked.length === 0) return allSkills.slice(0, 3);
    return picked;
}

// ─── Compensation extraction ──────────────────────────────────

function extractCompRange(text: string): string | undefined {
    if (!text) return undefined;
    const patterns = [
        /(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?\s*(?:lakh|lac|lpa|k)?/i,
        /\$[\d,]+(?:\.\d+)?\s*(?:k|per\s*year|\/year|pa|p\.a\.)?/i,
        /[\d,]+(?:\.\d+)?\s*(?:k|per\s*year|\/year|pa|p\.a\.)/i,
        /(?:salary|comp|ctc|package)\s*[:\-]?\s*(?:₹|\$|rs\.?|inr)?\s*[\d,]+(?:\.\d+)?\s*(?:lakh|lac|lpa|k)?/i,
    ];
    for (const pat of patterns) {
        const m = text.match(pat);
        if (m) return m[0]?.trim();
    }
    return undefined;
}

// ─── Seniority detection ──────────────────────────────────────

const SENIOR_INDICATORS = [
    "senior",
    "staff",
    "principal",
    "lead",
    "manager",
    "director",
    "vp",
    "head of",
    "architect",
    "fellow",
    "distinguished",
    "staff engineer",
    "principal engineer",
    "iii",
    "iv",
    "v",
    "5+ years",
    "6+ years",
    "7+ years",
    "8+ years",
];

function isSeniorRole(title: string, snippet?: string): boolean {
    const text = `${title} ${snippet || ""}`.toLowerCase();
    return SENIOR_INDICATORS.some((ind) => text.includes(ind));
}

// ─── Outreach blurb generation ────────────────────────────────

function buildOutreachBlurb(
    job: Job,
    profile: ReturnType<typeof loadActiveProfile>,
    candidate: ReturnType<typeof getProfileCandidate>,
    outreachConfig: ReturnType<typeof getProfileOutreach>,
): string {
    const name = candidate.name || "Candidate";
    const experience = getProfileExperience(profile);
    const allSkills = getProfileSkills(profile)
        .split(", ")
        .map((s) => s.trim())
        .filter(Boolean);

    const matchedSkills = matchSkillsToJob(job, allSkills);
    const topSkills =
        matchedSkills.slice(0, 3).join(", ") ||
        pickRelevantFallbackSkills(allSkills).join(", ");

    const seniorMismatch = isSeniorRole(job.title, job.snippet);
    const experienceLine = seniorMismatch
        ? `I'm early in my career (0-2 years) and looking for a team that invests in junior engineers.`
        : `${experience ? `I'm a ${experience}` : `I'm a software engineer`} focused on shipping reliable systems end to end.`;

    const companyHook =
        matchedSkills.length > 0
            ? `I noticed ${job.company} works with ${matchedSkills[0]} — that's one of my core tools.`
            : `I'm excited about ${job.company}'s work and this ${job.title} role.`;

    const skillLine =
        matchedSkills.length > 0
            ? `My experience with ${topSkills} directly aligns with what you're looking for.`
            : `My background is in ${topSkills} and similar modern stacks.`;

    const lines = [
        `Hi Hiring Manager, I'm ${name} — ${experienceLine}`,
        companyHook,
        skillLine,
        `I build production-style projects (tests, CI, DevOps-friendly) and can share concise repos${candidate.github ? ` (${candidate.github})` : ""}.`,
        "Would you be open to a quick chat or pointing me to the best next step? Thanks!",
    ];

    const templates = outreachConfig.short_dm || outreachConfig.long_dm || "";
    if (templates && templates.includes("{skills}")) {
        return templates
            .replace(/\{Name\}/g, "Hiring Manager")
            .replace(/\{candidate_name\}/g, name)
            .replace(/\{experience_level\}/g, experience || "software")
            .replace(/\{skills\}/g, topSkills)
            .replace(/\{role\}/g, job.title)
            .replace(/\{company\}/g, job.company);
    }

    return lines.join("\n");
}

// ─── LinkedIn people search URLs ──────────────────────────────

function buildPeopleSearchUrls(
    company: string,
    linkedinTitles: string[],
): PeopleSearchUrl[] {
    return (linkedinTitles || ["Engineering Manager", "Tech Lead", "CTO", "HR"])
        .slice(0, 3)
        .map((title) => ({
            title,
            url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${title} at ${company}`)}&origin=GLOBAL_SEARCH_HEADER`,
        }));
}

// ─── Skill gap analysis ───────────────────────────────────────

const SKILL_GAP_BLACKLIST = new Set([
    "software",
    "engineer",
    "engineering",
    "development",
    "developer",
    "technology",
    "technical",
    "system",
    "systems",
    "platform",
    "platforms",
    "service",
    "services",
    "application",
    "applications",
    "project",
    "projects",
    "team",
    "teams",
    "company",
    "companies",
    "product",
    "products",
    "data",
    "information",
    "process",
    "solutions",
    "solution",
    "build",
    "building",
    "built",
    "working",
    "experience",
    "knowledge",
    "understanding",
    "ability",
    "skills",
    "familiar",
    "proficiency",
    "proficient",
    "expertise",
    "expert",
    "requirement",
    "requirements",
    "qualification",
    "qualifications",
    "responsibility",
    "responsibilities",
    "duties",
    "role",
    "environment",
    "culture",
    "collaboration",
    "communication",
    "problem",
    "solving",
    "analysis",
    "analytical",
    "design",
    "architecture",
    "infrastructure",
    "management",
    "leadership",
    "mentoring",
    "agile",
    "scrum",
    "methodology",
    "best",
    "practices",
    "testing",
    "quality",
    "debugging",
    "troubleshooting",
    "documentation",
    "maintenance",
    "performance",
    "scalability",
    "reliability",
    "integration",
    "deployment",
    "automation",
    "innovation",
    "optimization",
    "improvement",
    "initiative",
    "proactive",
    "self-motivated",
    "detail",
    "oriented",
    "organized",
    "efficient",
    "independent",
    "collaborative",
    "cross-functional",
]);

function analyzeSkillGaps(
    jobs: Job[],
    allSkills: string[],
): SkillSignal | null {
    const skillCounts = new Map<string, number>();
    const totalJobs = jobs.length || 1;

    for (const job of jobs) {
        const jdTokens = new Set(
            extractJDKeywords(
                `${job.title} ${job.snippet || ""} ${(job.tags || []).join(" ")}`,
            ),
        );
        for (const token of jdTokens) {
            skillCounts.set(token, (skillCounts.get(token) || 0) + 1);
        }
    }

    const lowerSkills = new Set(allSkills.map((s) => s.toLowerCase()));
    const gaps: Array<{ skill: string; frequency: number; count: number }> = [];

    for (const [skill, count] of skillCounts) {
        const frequency = count / totalJobs;
        if (
            frequency >= 0.25 &&
            !lowerSkills.has(skill) &&
            !SKILL_GAP_BLACKLIST.has(skill)
        ) {
            gaps.push({ skill, frequency, count });
        }
    }

    gaps.sort((a, b) => b.frequency - a.frequency);

    if (gaps.length === 0) return null;

    const top = gaps[0]!;
    return {
        skill: top.skill,
        frequency: Math.round(top.frequency * 100),
        count: top.count,
        currentLevel: "Not listed",
        marketDemand: top.frequency >= 0.4 ? "High" : "Medium",
    };
}

// ─── Build a single match entry ───────────────────────────────

function buildMatch(
    job: Job,
    idx: number,
    allSkills: string[],
    targetLocations: string[],
): DigestMatch {
    const matchedSkills = matchSkillsToJob(job, allSkills);
    const evaluation = job.evaluation;
    const score: MatchScore = {
        overall: evaluation?.overall || 0,
        roleFit: evaluation?.roleFit || 0,
        location: evaluation?.locationFit || 0,
        growth: evaluation?.growth || 0,
        compensation: evaluation?.compensationFit || 0,
        culture: evaluation?.cultureFit || 0,
    };

    const whyMatch: string[] = [];
    if (matchedSkills.length > 0) {
        whyMatch.push(
            `${matchedSkills.slice(0, 4).join(", ")} match your profile`,
        );
    }
    if (
        job.location?.toLowerCase().includes("remote") ||
        targetLocations.some((l) =>
            job.location?.toLowerCase().includes(l.toLowerCase()),
        )
    ) {
        whyMatch.push("Remote preference matches");
    }
    if (evaluation && evaluation.overall >= SCORE_STRONG) {
        whyMatch.push("Strong overall fit");
    }

    return {
        rank: idx + 1,
        company: job.company,
        title: job.title,
        location: normalizeLocation(job.location),
        posted: job.postedAt || "Unknown",
        url: job.url,
        isRemote: job.location?.toLowerCase().includes("remote") || false,
        compensation: extractCompRange(job.snippet || ""),
        score,
        verdict: evaluation?.overall
            ? scoreToVerdict(evaluation.overall)
            : "Unscored",
        label: evaluation?.overall ? topLabel(evaluation.overall) : "Unscored",
        whyMatch,
        matchedSkills: matchedSkills.slice(0, 6),
        recommendation: evaluation?.recommendation || "",
        redFlags: evaluation?.redFlags || [],
        snippet: truncate(job.snippet, 220),
    };
}

// ─── Main: Build the ViewModel ────────────────────────────────

export function buildViewModel(
    jobs: Job[],
    options: ViewModelOptions = {},
): DigestViewModel {
    const profile = loadActiveProfile();
    const candidate = getProfileCandidate(profile);
    const outreachConfig = getProfileOutreach(profile);
    const targetLocations = getProfileTargetLocations(profile);
    const targetRoles = getProfileTargetRoles(profile);

    const allSkills = getProfileSkills(profile)
        .split(", ")
        .map((s) => s.trim())
        .filter(Boolean);

    const linkedinTitles = (outreachConfig.linkedin_titles as string[]) || [
        "Engineering Manager",
        "Tech Lead",
        "CTO",
        "HR",
    ];

    const now = new Date();
    const dateStr =
        options.dateStr || now.toISOString().replace("T", " ").substring(0, 16);
    const dateLong = now.toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
    const dateShort = now.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
    });

    const strongMatches = jobs.filter(
        (j) => j.evaluation?.overall && j.evaluation.overall >= SCORE_STRONG,
    ).length;
    const worthReviewing = jobs.filter(
        (j) =>
            j.evaluation?.overall &&
            j.evaluation.overall >= SCORE_REVIEW &&
            j.evaluation.overall < SCORE_STRONG,
    ).length;
    const companies = new Set(jobs.map((j) => j.company));

    const topMatches = jobs.map((job, idx) =>
        buildMatch(job, idx, allSkills, targetLocations),
    );

    const skillGap = analyzeSkillGaps(jobs, allSkills);

    const actions: Array<{ label: string; url: string; reason: string; priority: number }> = [];
    for (const m of topMatches) {
        if (m.score.overall >= SCORE_STRONG) {
            actions.push({
                label: `Apply to ${m.company}`,
                url: m.url,
                reason: `Strongest match today — ${m.score.overall.toFixed(1)}/5`,
                priority: 1,
            });
        } else if (m.score.overall >= SCORE_REVIEW) {
            actions.push({
                label: `Review ${m.company}`,
                url: m.url,
                reason: `Good match — ${m.score.overall.toFixed(1)}/5`,
                priority: 2,
            });
        }
    }

    if (skillGap) {
        actions.push({
            label: `Learn ${skillGap.skill}`,
            url: `#skill-gap-${skillGap.skill.toLowerCase()}`,
            reason: `Appeared in ${skillGap.frequency}% of target roles (${skillGap.count} jobs)`,
            priority: 3,
        });
    }

    actions.sort((a, b) => a.priority - b.priority);

    const peopleCompanyMap = new Map<string, OutreachGroup>();
    for (const match of topMatches) {
        if (!peopleCompanyMap.has(match.company)) {
            peopleCompanyMap.set(match.company, {
                company: match.company,
                roles: [],
                roleCount: 0,
                peopleSearchUrls: buildPeopleSearchUrls(
                    match.company,
                    linkedinTitles,
                ),
            });
        }
        const entry = peopleCompanyMap.get(match.company)!;
        entry.roles.push(match.title);
        entry.roleCount++;
    }

    const peopleToContact = [...peopleCompanyMap.values()]
        .slice(0, 5)
        .map((c) => {
            const firstJob = jobs.find((j) => j.company === c.company);
            return {
                ...c,
                outreachBlurb: firstJob
                    ? buildOutreachBlurb(
                          firstJob,
                          profile,
                          candidate,
                          outreachConfig,
                      )
                    : "",
            };
        });

    const heroJob = topMatches[0] ?? null;
    const moreJobs = topMatches.slice(1, 4);

    const whyJobOps = heroJob?.score.overall
        ? (() => {
              const matched = heroJob.matchedSkills.length;
              const totalReqs =
                  (heroJob.whyMatch?.length || 0) +
                  (heroJob.matchedSkills?.length || 0) || 5;
              const matchReasons: string[] = [];
              if (matched > 0) {
                  matchReasons.push(
                      `${matched} of ~${totalReqs} core requirements matched`,
                  );
              }
              if (heroJob.matchedSkills.length > 0) {
                  matchReasons.push(
                      `Key overlaps: ${heroJob.matchedSkills.slice(0, 4).join(", ")}`,
                  );
              }
              if (heroJob.isRemote) {
                  matchReasons.push("Remote — matches your preference");
              }
              if (heroJob.score.overall >= SCORE_STRONG) {
                  matchReasons.push("Strong overall fit");
              }
              const missingRequirements = allSkills
                  .map((s) => s.toLowerCase())
                  .filter(
                      (s) =>
                          !heroJob.matchedSkills
                              .map((m) => m.toLowerCase())
                              .includes(s),
                  )
                  .slice(0, 3);
              return {
                  matchReasons,
                  requirementMatches: heroJob.matchedSkills.slice(0, 6),
                  missingRequirements,
              };
          })()
        : null;

    const marketSignal = skillGap
        ? {
              skill: skillGap.skill,
              frequency: skillGap.frequency,
              count: skillGap.count,
              currentLevel: skillGap.currentLevel,
              marketDemand: skillGap.marketDemand,
          }
        : null;

    const yourMove: YourMoveAction[] = actions.map((a) => ({
        label: a.label,
        url: a.url,
        reason: a.reason,
        priority: a.priority as 1 | 2 | 3,
    }));

    return {
        date: { full: dateStr, long: dateLong, short: dateShort },
        profile: { name: candidate.name || "", targetRoles, targetLocations },
        summary: {
            totalScanned: options.totalScanned || jobs.length,
            freshCount: options.freshCount || jobs.length,
            strongMatches,
            worthReviewing,
            newCompanies: companies.size,
        },
        topMatches,
        heroJob,
        moreJobs,
        whyJobOps,
        peopleToContact,
        marketSignal,
        yourMove,
        acceleratorResearch: options.acceleratorResearch || null,
        footer: {
            scanned: options.totalScanned || jobs.length,
            filtered: jobs.length,
            unscoredCount: options.unscoredCount || 0,
        },
    };
}
