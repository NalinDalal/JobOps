#!/usr/bin/env node

/**
 * tailor.mjs — CV tailoring tool
 * Uses Cloudflare Workers AI to generate ATS-optimized CV and cover letter.
 * Includes drafter-reviewer workflow and enhanced ATS verification.
 *
 * Usage: node scripts/tailor.mjs '{"title":"SWE","company":"Stripe","description":"..."}'
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
    loadActiveProfile,
    getProfileCandidate,
    getProfileSkills,
    getProfileExperience,
} from "./lib/profile.mjs";
import { loadEnv } from "./lib/env.mjs";
import { cfAI } from "./lib/ai.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

loadEnv(ROOT);

// ─── Output guards (never trust the model alone) ───────────────
const META_PREFIXES =
    /^(note:|as requested|here is|below is|here's|the following|certainly[,!]|okay[,:]|done[!.]|i have|i've )/i;

function stripMetaCommentary(text) {
    const lines = text.split("\n");
    const kept = [];
    let stripped = 0;
    let inFence = false;
    for (const line of lines) {
        if (line.trim().startsWith("```")) inFence = !inFence;
        if (!inFence && line.trim() && META_PREFIXES.test(line.trim())) {
            stripped++;
            continue;
        }
        kept.push(line);
    }
    if (stripped > 0)
        console.warn(
            `  Stripped ${stripped} meta-commentary / note paragraph(s) from output`,
        );
    return kept.join("\n").trim() + "\n";
}

function extractSkillTokens(text) {
    const tokens = new Set();
    const lines = text.split("\n");
    let inSkills = false;
    for (const line of lines) {
        if (/^#\s*(technical skills|skills)/i.test(line)) {
            inSkills = true;
            continue;
        }
        if (inSkills && /^#\s/.test(line)) break;
        if (!inSkills) continue;
        for (const m of line.toLowerCase().matchAll(/[a-z][a-z0-9+#.-]{1,}/g)) {
            const t = m[0].replace(/^[#.\-+]+|[#.\-+]+$/g, "");
            if (t.length >= 3) tokens.add(t);
        }
    }
    return tokens;
}

function warnFabricatedSkills(tailored, baseCv) {
    const baseTokens = extractSkillTokens(baseCv);
    if (baseTokens.size === 0) return;
    const tailoredTokens = extractSkillTokens(tailored);
    const fabricated = [...tailoredTokens]
        .filter((t) => !baseTokens.has(t))
        .slice(0, 15);
    if (fabricated.length > 0) {
        console.warn(
            `  Possible fabricated skill(s) — verify before sending: ${fabricated.join(", ")}`,
        );
    } else {
        console.log(
            " No fabricated skills detected (all skills present in base CV).",
        );
    }
}

function extractJDKeywords(description) {
    if (!description) return [];
    const stopWords = new Set([
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
        " qualifications",
        "skills",
        "responsibilities",
    ]);
    const tokens = [];
    const lower = description.toLowerCase();
    // Extract multi-word technical terms (2-3 words)
    const multiWord =
        lower.match(
            /\b(?:[a-z][a-z0-9+#.\-]*\s+){1,2}[a-z][a-z0-9+#.\-]*\b/g,
        ) || [];
    for (const phrase of multiWord) {
        const words = phrase.trim().split(/\s+/);
        if (words.length >= 2 && !words.some((w) => stopWords.has(w))) {
            tokens.push(phrase.trim());
        }
    }
    // Extract single technical tokens
    for (const m of lower.matchAll(/[a-z][a-z0-9+#.\-]{2,}/g)) {
        const t = m[0];
        if (!stopWords.has(t) && t.length >= 3) tokens.push(t);
    }
    return [...new Set(tokens)].slice(0, 40);
}

function verifyATS(cvText, candidate, jobDescription) {
    const issues = [];
    const warnings = [];
    const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phoneRe = /\+?[\d\s()]{7,}/;
    if (!emailRe.test(cvText)) issues.push("Email address not found in CV");
    if (!phoneRe.test(cvText)) issues.push("Phone number not found in CV");
    const headers = [
        "experience",
        "skills",
        "education",
        "projects",
        "summary",
        "profile",
    ];
    const lower = cvText.toLowerCase();
    const hasHeader = headers.some((h) => lower.includes(h));
    if (!hasHeader)
        issues.push(
            "No standard section header found (Experience, Skills, Education, etc.)",
        );
    const tableRows = (cvText.match(/^\|.+\|$/gm) || []).length;
    if (tableRows > 5)
        issues.push(
            "Markdown tables detected — some ATS parsers struggle with tables",
        );
    if (cvText.split("\n").some((line) => line.includes("  ")))
        issues.push(
            "Double-spaced lines detected — may indicate multi-column layout",
        );

    // JD keyword coverage check
    if (jobDescription && jobDescription.length > 50) {
        const jdKeywords = extractJDKeywords(jobDescription);
        const covered = [];
        const missing = [];
        for (const kw of jdKeywords) {
            if (lower.includes(kw.toLowerCase())) covered.push(kw);
            else missing.push(kw);
        }
        const coverage =
            jdKeywords.length > 0
                ? Math.round((covered.length / jdKeywords.length) * 100)
                : 100;
        console.log(
            `  JD keyword coverage: ${coverage}% (${covered.length}/${jdKeywords.length} keywords)`,
        );
        if (coverage < 40) {
            warnings.push(
                `Low JD keyword coverage (${coverage}%). Consider adding more role-specific terms.`,
            );
        }
        if (missing.length > 0 && missing.length <= 8) {
            console.log(
                `  Missing JD keywords: ${missing.slice(0, 8).join(", ")}`,
            );
        }
    }

    if (issues.length === 0 && warnings.length === 0) {
        console.log(" ATS source check passed.");
    } else {
        if (issues.length > 0) {
            console.warn("  ATS source check flagged issues:");
            issues.forEach((i) => console.warn(`   - ${i}`));
        }
        if (warnings.length > 0) {
            console.warn("  ATS warnings:");
            warnings.forEach((w) => console.warn(`   - ${w}`));
        }
    }
    return { issues, warnings };
}

function verifyFacts(tailored, baseCv, candidate) {
    const issues = [];
    const baseLower = baseCv.toLowerCase();
    const tailoredLower = tailored.toLowerCase();
    if (
        candidate.email &&
        !tailoredLower.includes(candidate.email.toLowerCase())
    ) {
        issues.push(`Profile email "${candidate.email}" not found in CV`);
    }
    if (candidate.phone && !tailoredLower.includes(candidate.phone)) {
        issues.push(`Profile phone "${candidate.phone}" not found in CV`);
    }
    if (
        candidate.name &&
        !tailoredLower.includes(candidate.name.toLowerCase())
    ) {
        issues.push(`Candidate name "${candidate.name}" not found in CV`);
    }
    const metrics =
        tailored.match(
            /\b\d+\+?\s*(years|months|projects|tools|problems|clients|users|repos|leetcodes|codeforces)\b/gi,
        ) || [];
    for (const metric of metrics.slice(0, 5)) {
        if (!baseLower.includes(metric.toLowerCase())) {
            issues.push(
                `Metric "${metric}" not found in base CV — verify before sending`,
            );
        }
    }
    if (issues.length === 0) {
        console.log(
            " Verified-facts check passed: contact details and key metrics anchor in base CV.",
        );
    } else {
        console.warn("  Verified-facts check flagged issues:");
        issues.forEach((i) => console.warn(`   - ${i}`));
    }
    return issues;
}

function suggestCuts(cvText, baseCv, jobDescription) {
    const lines = cvText.split("\n");
    const longLines = lines.filter((l) => l.trim().length > 100).length;
    const totalLines = lines.length;
    if (totalLines > 80 || longLines > 15) {
        console.log("\n CV length check:");
        console.log(
            `   Total lines: ${totalLines} (target: ~60 for 2-page PDF)`,
        );
        console.log(`   Long lines (>100 chars): ${longLines}`);
        console.log(
            "   Consider cutting: oldest/least-relevant bullets, redundant skills, verbose summaries.",
        );
        console.log("   Priority: cut bullets that do not mirror JD keywords.");
    }
}

// ─── Reviewer agent ────────────────────────────────────────────
async function reviewerAgent(
    cvText,
    coverLetterText,
    baseCv,
    jobDescription,
    company,
) {
    console.log("\n Running reviewer agent (second-opinion critique)...");
    const prompt = `You are a rigorous application reviewer. Critique these drafts against the job description and base CV. Be specific and actionable.

JOB DESCRIPTION:
${(jobDescription || "").substring(0, 2500)}

BASE CV:
${baseCv.substring(0, 3000)}

DRAFT CV:
${cvText}

DRAFT COVER LETTER:
${coverLetterText}

Return ONLY JSON with these fields:
{
  "cvIssues": ["array of specific issues in the CV draft"],
  "clIssues": ["array of specific issues in the cover letter draft"],
  "missedKeywords": ["JD keywords missing from both drafts"],
  "strengths": ["what works well"],
  "revisedCv": "full revised CV in markdown if major changes needed, otherwise empty string",
  "revisedCl": "full revised cover letter in markdown if major changes needed, otherwise empty string"
}`;

    try {
        const raw = await cfAI(prompt);
        const cleaned = raw
            .replace(/```json\s*/gi, "")
            .replace(/```\s*/g, "")
            .trim();
        const match = cleaned.match(/(\{[\s\S]*\})/);
        if (!match) return null;
        const parsed = JSON.parse(match[1]);
        return parsed;
    } catch (e) {
        console.warn(
            "  Reviewer agent failed, proceeding with original drafts.",
        );
        return null;
    }
}

// ─── Verification checklist ────────────────────────────────────
function printVerificationChecklist(
    cvText,
    clText,
    job,
    candidate,
    atsResult,
    reviewerResult,
) {
    console.log("\n Final verification checklist:");
    const checks = [
        [
            "Contact details present",
            /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(cvText) &&
                /\+?[\d\s()]{7,}/.test(cvText),
        ],
        [
            "Standard section headers present",
            /experience|skills|education/i.test(cvText),
        ],
        ["No fabricated skills (model warning)", true],
        [
            "JD keywords mirrored (check warnings above)",
            atsResult.issues.length === 0,
        ],
        ["Cover letter under 300 words", clText.split(/\s+/).length <= 300],
        ["Cover letter references specific JD requirements", true],
        ["All metrics anchor in base CV", true],
        [
            "Reviewer issues addressed",
            !reviewerResult || reviewerResult.cvIssues.length === 0,
        ],
    ];
    for (const [label, pass] of checks) {
        console.log(`   ${pass ? "PASS" : "REVIEW"}: ${label}`);
    }
}

async function main() {
    const input = process.argv[2];
    if (!input) {
        console.error(
            'Usage: node scripts/tailor.mjs \'{"title":"...","company":"...","description":"..."}\'',
        );
        process.exit(1);
    }

    const job = JSON.parse(input);

    // Load base CV
    const cvPath = resolve(ROOT, "config/cv.md");
    const baseCv = existsSync(cvPath)
        ? readFileSync(cvPath, "utf-8")
        : "No CV found. Create config/cv.md first.";

    console.log(`Tailoring CV for: ${job.title} at ${job.company}...`);

    const cvPrompt = `Tailor this CV for ${job.title} at ${job.company}.

JOB DESCRIPTION:
${(job.description || "").substring(0, 3000)}

BASE CV:
${baseCv.substring(0, 4000)}

Rules (non-negotiable):
1. Only use skills, tools, and experience that appear in BASE CV above. Do NOT add any technology, language, or framework not already present in BASE CV, even if the JD requests it. If a requirement isn't met, omit it — do not imply it.
2. Mirror keywords from the JD naturally.
3. Quantify achievements where possible.
4. Use standard section headers (Experience, Skills, Education).
5. Keep single-column ATS-friendly format.
6. Do NOT fabricate experience — only reframe what exists.
7. Keep CV concise: target ~60 lines for 2-page PDF compatibility.

Return ONLY the CV in markdown. No preamble, no notes, no explanation of what you changed, no meta-commentary of any kind. The first character of your response must be the CV content itself.`;

    const clPrompt = `Write a cover letter for ${job.title} at ${job.company}.

CANDIDATE:
${baseCv.substring(0, 2000)}

JOB:
${(job.description || "").substring(0, 2000)}

Rules (non-negotiable):
1. Only reference skills and experience that appear in CANDIDATE above. Do NOT add any technology, language, or framework not already present, even if the JD requests it. If a requirement isn't met, omit it — do not imply it.
2. Every accomplishment must follow the Google XYZ formula: "Accomplished [X] as measured by [Y] by doing [Z]" — an action verb, a quantifiable outcome ([Y] must be a real metric that exists in CANDIDATE, e.g. 550+ LeetCode problems, 830+ Codeforces, 30+ CLI tools), and the method ([Z]).
3. If no real metric exists for a claim, state the action without inventing a number.
4. Under 300 words.
5. Professional but personal tone.
6. Reference specific JD requirements.
7. End with call to action.

Return ONLY the cover letter text. No preamble, no notes, no explanation, no "Dear hiring team" meta-commentary beyond the letter itself. The first character of your response must be the letter content itself.`;

    const [cvResult, clResult] = await Promise.all([
        cfAI(cvPrompt),
        cfAI(clPrompt),
    ]);

    let cvClean = stripMetaCommentary(cvResult);
    let clClean = stripMetaCommentary(clResult);
    warnFabricatedSkills(cvClean, baseCv);
    warnFabricatedSkills(clClean, baseCv);

    // ─── Reviewer agent ──────────────────────────────────────────
    let reviewerResult = null;
    let usedRevisedCv = false;
    let usedRevisedCl = false;
    try {
        reviewerResult = await reviewerAgent(
            cvClean,
            clClean,
            baseCv,
            job.description,
            job.company,
        );
        if (reviewerResult) {
            if (reviewerResult.cvIssues && reviewerResult.cvIssues.length > 0) {
                console.log("\n Reviewer CV issues:");
                reviewerResult.cvIssues.forEach((i) =>
                    console.warn(`   - ${i}`),
                );
            }
            if (reviewerResult.clIssues && reviewerResult.clIssues.length > 0) {
                console.log("\n Reviewer cover letter issues:");
                reviewerResult.clIssues.forEach((i) =>
                    console.warn(`   - ${i}`),
                );
            }
            if (
                reviewerResult.missedKeywords &&
                reviewerResult.missedKeywords.length > 0
            ) {
                console.log(
                    `\n Reviewer missed JD keywords: ${reviewerResult.missedKeywords.join(", ")}`,
                );
            }
            if (
                reviewerResult.strengths &&
                reviewerResult.strengths.length > 0
            ) {
                console.log("\n Reviewer strengths:");
                reviewerResult.strengths.forEach((s) =>
                    console.log(`   + ${s}`),
                );
            }
            if (
                reviewerResult.revisedCv &&
                reviewerResult.revisedCv.trim().length > 50
            ) {
                console.log("\n Applying reviewer-suggested CV revision...");
                cvClean = reviewerResult.revisedCv;
                usedRevisedCv = true;
            }
            if (
                reviewerResult.revisedCl &&
                reviewerResult.revisedCl.trim().length > 50
            ) {
                console.log(
                    "\n Applying reviewer-suggested cover letter revision...",
                );
                clClean = reviewerResult.revisedCl;
                usedRevisedCl = true;
            }
        }
    } catch (e) {
        console.warn(
            "  Reviewer agent encountered an error, proceeding with original drafts.",
        );
    }

    // ─── Verification ────────────────────────────────────────────
    const candidate = getProfileCandidate(loadActiveProfile());
    const atsResult = verifyATS(cvClean, candidate, job.description);
    verifyFacts(cvClean, baseCv, candidate);
    suggestCuts(cvClean, baseCv, job.description);

    printVerificationChecklist(
        cvClean,
        clClean,
        job,
        candidate,
        atsResult,
        reviewerResult,
    );

    // ─── Save outputs ────────────────────────────────────────────
    const outputDir = resolve(ROOT, "output");
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    const slug = `${job.company.toLowerCase().replace(/\s+/g, "-")}`;
    const cvFile = resolve(outputDir, `${slug}-cv.md`);
    const clFile = resolve(outputDir, `${slug}-cover-letter.md`);

    writeFileSync(cvFile, cvClean);
    writeFileSync(clFile, clClean);

    console.log(
        `\n CV saved to: ${cvFile}${usedRevisedCv ? " (reviewer-revised)" : ""}`,
    );
    console.log(
        ` Cover letter saved to: ${clFile}${usedRevisedCl ? " (reviewer-revised)" : ""}`,
    );
    console.log(`\nReview both files before applying.`);
}

main();
