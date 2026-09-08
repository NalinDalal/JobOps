#!/usr/bin/env node

/**
 * digest.mjs — Daily job digest (push mode for JobOps)
 * Scans all portals, filters fresh jobs, optionally scores the top N
 * with Cloudflare AI, generates a personalized briefing email.
 *
 * Architecture: Job data → ranking → DigestViewModel → Email renderer
 *
 * Usage:
 *   node scripts/digest.mjs                          — preview to console (no email)
 *   node scripts/digest.mjs --mode daily             — email digest, marks jobs as seen
 *   node scripts/digest.mjs --max 10                 — limit email to N jobs
 *   node scripts/digest.mjs --evaluate 0             — disable AI scoring
 *   node scripts/digest.mjs --query "backend"        — custom scan query (default: auto from profile.yml)
 *   node scripts/digest.mjs --query auto             — scan each target_role from config/profile.yml
 *   node scripts/digest.mjs --mock                   — use mock data for testing
 *   node scripts/digest.mjs --send                   — send email (alias for --mode daily)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { load as yamlLoad } from "js-yaml";
import { loadActiveProfile } from "./lib/profile.mjs";
import {
    SCORE_STRONG,
    SCORE_REVIEW,
    IST_OFFSET_HOURS,
    MS_PER_HOUR,
} from "./lib/constants.mjs";
import { buildViewModel } from "./lib/digestViewModel.mjs";
import { renderEmail, renderText } from "./lib/digestRenderer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SEEN_PATH = resolve(ROOT, "data/digest-seen.json");

// ─── Args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argVal(name, fallback) {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1 || idx === args.length - 1) return fallback;
    return args[idx + 1];
}
function argFlag(name) {
    return args.includes(`--${name}`);
}

const MODE =
    argFlag("send") || argFlag("daily") ? "daily" : argVal("mode", "preview");
const MAX_JOBS = parseInt(argVal("max", "50"), 10) || 50;
const EVAL_TOP = parseInt(argVal("evaluate", "5"), 10) || 0;
const QUERY = argVal("query", "auto");
const MOCK_MODE = argFlag("mock");

// ─── Load search.yml config ──────────────────────────────────────
function loadSearchConfig() {
    try {
        const cfg =
            yamlLoad(
                readFileSync(resolve(ROOT, "config/search.yml"), "utf-8"),
            ) || {};
        return {
            score_threshold: cfg.score_threshold || SCORE_REVIEW,
            max_per_digest: cfg.max_per_digest || 10,
            max_age_days: cfg.max_age_days || 30,
        };
    } catch {
        return {
            score_threshold: SCORE_REVIEW,
            max_per_digest: 10,
            max_age_days: 30,
        };
    }
}
const searchConfig = loadSearchConfig();

// ─── Env ─────────────────────────────────────────────────────────
const envPath = resolve(ROOT, ".env");
if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
        const [key, ...val] = line.split("=");
        if (key && val.length) process.env[key.trim()] = val.join("=").trim();
    }
}
const HAS_CF_KEYS =
    (process.env.CLOUDFLARE_API_KEY || process.env.CLOUDFLARE_API_TOKEN) &&
    process.env.CLOUDFLARE_ACCOUNT_ID;

// ─── Seniority filter ────────────────────────────────────────────
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

function isSeniorRole(title, snippet) {
    const text = `${title} ${snippet || ""}`.toLowerCase();
    return SENIOR_INDICATORS.some((ind) => text.includes(ind));
}

// ─── Seen database (dedup) ──────────────────────────────────────
function loadSeen() {
    try {
        if (existsSync(SEEN_PATH)) {
            const data = JSON.parse(readFileSync(SEEN_PATH, "utf-8"));
            return new Set(data.seen || []);
        }
    } catch (e) {
        console.warn(`Warning: Could not load seen jobs: ${e.message}`);
    }
    return new Set();
}

function saveSeen(seen) {
    mkdirSync(resolve(ROOT, "data"), { recursive: true });
    writeFileSync(
        SEEN_PATH,
        JSON.stringify(
            { seen: [...seen].sort(), updated: new Date().toISOString() },
            null,
            2,
        ),
    );
}

const jobId = (j) => `${j.company}::${j.title}::${j.url}`;

// ─── Scan ────────────────────────────────────────────────────────
function runScan() {
    const scanArgs = [resolve(ROOT, "scripts/scan.mjs")];
    if (QUERY !== "auto") scanArgs.push(QUERY);
    else scanArgs.push("auto");
    scanArgs.push("any");
    if (MOCK_MODE) scanArgs.push("--mock");

    return new Promise((resolvePromise, reject) => {
        const child = spawn(process.execPath, scanArgs, { cwd: ROOT });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d));
        child.stderr.on("data", (d) => (stderr += d));
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0)
                return reject(new Error(stderr || `scan.mjs exited ${code}`));
            const match = stdout.match(/\[[\s\S]*\]\s*$/);
            if (!match) return reject(new Error("Could not parse scan output"));
            resolvePromise(JSON.parse(match[0]));
        });
    });
}

// ─── Evaluation (optional, top N) ────────────────────────────────
function evaluateJob(job) {
    return new Promise((resolvePromise) => {
        const payload = JSON.stringify({
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.snippet || "",
        });
        const child = spawn(
            process.execPath,
            [resolve(ROOT, "scripts/evaluate.mjs"), payload],
            {
                cwd: ROOT,
            },
        );
        let stdout = "";
        child.stdout.on("data", (d) => (stdout += d));
        child.on("error", () => resolvePromise(null));
        child.on("close", (code) => {
            if (code !== 0) return resolvePromise(null);
            const marker = stdout.lastIndexOf("---EVAL_JSON---");
            if (marker === -1) return resolvePromise(null);
            try {
                const evalJson = stdout
                    .slice(marker + "---EVAL_JSON---".length)
                    .trim();
                const firstLine = evalJson.split("\n")[0];
                resolvePromise(JSON.parse(firstLine));
            } catch {
                resolvePromise(null);
            }
        });
    });
}

async function evaluateTop(fresh, limit) {
    if (!HAS_CF_KEYS || limit <= 0 || fresh.length === 0) return;
    const targets = fresh.slice(0, limit);
    console.log(`Evaluating top ${targets.length} jobs with Cloudflare AI...`);
    const results = await Promise.allSettled(
        targets.map((j) => evaluateJob(j)),
    );
    results.forEach((r, i) => {
        if (r.status === "fulfilled" && r.value) {
            targets[i].evaluation = r.value;
        }
    });
}

// ─── Email via Resend ───────────────────────────────────────────
async function sendEmailResend(subject, text, html) {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM;
    const to = process.env.MAIL_TO;
    if (!key || !from || !to) return false;

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, subject, text, html }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Resend ${res.status}: ${body.substring(0, 300)}`);
    }
    console.log(`Email sent via Resend to ${to}`);
    return true;
}

// ─── Email via SMTP (Gmail App Password) ────────────────────────
async function sendEmailSMTP(subject, text, html) {
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const to = process.env.MAIL_TO;
    const from = process.env.MAIL_FROM || user;

    if (!user || !pass || !to) return false;

    try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass },
        });

        await transporter.sendMail({ from, to, subject, text, html });
        console.log(`Email sent via SMTP to ${to}`);
        return true;
    } catch (e) {
        console.warn(
            "SMTP send failed (nodemailer not installed?):",
            e.message,
        );
        return false;
    }
}

async function sendEmail(subject, text, html) {
    if (process.env.RESEND_API_KEY) {
        return sendEmailResend(subject, text, html);
    }
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        return sendEmailSMTP(subject, text, html);
    }

    console.log(
        "\n[email] No RESEND_API_KEY or SMTP credentials — printing digest instead.\n",
    );
    console.log(`Subject: ${subject}\n`);
    console.log(text);
    return false;
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
    console.log(
        `Digest mode=${MODE} query="${QUERY}" max=${MAX_JOBS} evaluate=${HAS_CF_KEYS ? EVAL_TOP : 0} mock=${MOCK_MODE}`,
    );
    console.log(
        `Config: score_threshold=${searchConfig.score_threshold} max_per_digest=${searchConfig.max_per_digest} max_age_days=${searchConfig.max_age_days}`,
    );

    const all = await runScan();
    const seen = loadSeen();
    const fresh = all.filter((j) => !seen.has(jobId(j)));
    console.log(`Scanned: ${all.length} jobs | Fresh: ${fresh.length}`);

    await evaluateTop(fresh, EVAL_TOP);

    // Filter by score threshold
    const threshold = searchConfig.score_threshold;
    const scored = fresh.filter(
        (j) => j.evaluation?.overall && j.evaluation.overall >= threshold,
    );
    const unscored = fresh.filter((j) => !j.evaluation?.overall);
    const belowThreshold = fresh.filter(
        (j) => j.evaluation?.overall && j.evaluation.overall < threshold,
    );

    // Downgrade senior-mismatch jobs from "strong match" to "worth reviewing"
    for (const j of [...scored, ...unscored]) {
        if (
            isSeniorRole(j.title, j.snippet) &&
            j.evaluation?.overall >= SCORE_STRONG
        ) {
            j.evaluation = j.evaluation || {};
            j.evaluation.overall = Math.min(j.evaluation.overall, SCORE_REVIEW);
            j.evaluation.recommendation =
                j.evaluation.recommendation ||
                "Seniority mismatch — review before applying";
            if (!j.evaluation.redFlags) j.evaluation.redFlags = [];
            if (
                !j.evaluation.redFlags.includes(
                    "JD appears senior-level; confirm junior/entry fit",
                )
            ) {
                j.evaluation.redFlags.push(
                    "JD appears senior-level; confirm junior/entry fit",
                );
            }
        }
    }

    console.log(
        `Score filter (>= ${threshold}): ${fresh.length} → ${scored.length} above, ${belowThreshold.length} below, ${unscored.length} unscored`,
    );

    scored.sort((a, b) => b.evaluation.overall - a.evaluation.overall);
    unscored.sort((a, b) => String(b.posted).localeCompare(String(a.posted)));

    // Combine: scored first, then unscored, limit to max_per_digest
    const maxDigest = Math.min(searchConfig.max_per_digest, MAX_JOBS);
    const digestJobs = [...scored, ...unscored].slice(0, maxDigest);

    if (MODE === "daily") {
        fresh.forEach((j) => seen.add(jobId(j)));
        saveSeen(seen);
    }

    // Build the view model — this is where data meets presentation
    const now = new Date();
    const ist = new Date(now.getTime() + IST_OFFSET_HOURS * MS_PER_HOUR * 1000);
    const dateStr =
        ist.toISOString().replace("T", " ").substring(0, 16) + " IST";

    const viewModel = buildViewModel(digestJobs, {
        dateStr,
        totalScanned: all.length,
        freshCount: fresh.length,
    });

    const subject = (() => {
        const strong = viewModel.summary.strongMatches;
        const review = viewModel.summary.worthReviewing;
        if (strong > 0)
            return `JobOps · ${strong} strong match${strong > 1 ? "es" : ""} · ${review} to review`;
        if (review > 0)
            return `JobOps · ${review} job${review > 1 ? "s" : ""} worth reviewing`;
        return `JobOps · ${fresh.length} new jobs scanned`;
    })();

    // Render
    const reportsDir = resolve(ROOT, "reports");
    if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

    const html = renderEmail(viewModel);
    const text = renderText(viewModel);

    // Save full report (local only; CI runners are ephemeral)
    const isCI = Boolean(process.env.CI);
    if (!isCI) {
        const fullReportFile = resolve(
            reportsDir,
            `digest-full-${ist.toISOString().split("T")[0]}.html`,
        );
        writeFileSync(fullReportFile, html);
        console.log(`Full report: ${fullReportFile}`);
    }

    const sent = await sendEmail(subject, text, html);

    const digestFile = resolve(
        reportsDir,
        `digest-${ist.toISOString().split("T")[0]}.md`,
    );
    writeFileSync(digestFile, `# JobOps Digest — ${dateStr}\n\n${text}\n`);
    console.log(`\nDigest saved to: ${digestFile}`);
    console.log(
        sent
            ? "Done."
            : "Preview only — configure RESEND_API_KEY or SMTP credentials to email.",
    );
}

main().catch((e) => {
    console.error(`Digest failed: ${e.message}`);
    process.exit(1);
});
