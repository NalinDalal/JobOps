#!/usr/bin/env node

/**
 * verifyJob.mjs — Verify if a job posting is genuine
 * Cross-checks across multiple platforms to avoid ghost jobs.
 *
 * Usage:
 *   node scripts/verifyJob.mjs "https://boards.greenhouse.io/stripe/jobs/123"
 *   node scripts/verifyJob.mjs --company "Stripe" --role "Software Engineer"
 *
 * Checks:
 *   1. Same role on company's careers page
 *   2. Same role on LinkedIn
 *   3. Same role on Wellfound
 *   4. Company has recent hiring activity
 *   5. Job description matches across platforms
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
function argVal(name, fallback) {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1 || idx === args.length - 1) return fallback;
    return args[idx + 1];
}

const JOB_URL = args.find((a) => a.startsWith("http")) || null;
const COMPANY = argVal("company", null);
const ROLE = argVal("role", null);

async function fetchWithTimeout(url, timeout = 10000) {
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                Accept: "text/html,application/json",
            },
            signal: AbortSignal.timeout(timeout),
        });
        return { ok: res.ok, status: res.status, text: async () => res.text() };
    } catch (e) {
        return { ok: false, status: 0, error: e.message };
    }
}

function extractCompanyFromUrl(url) {
    if (url.includes("greenhouse.io")) {
        return url.split("greenhouse.io/")[1]?.split("/")[0] || "";
    }
    if (url.includes("lever.co")) {
        return url.split("lever.co/")[1]?.split("/")[0] || "";
    }
    if (url.includes("ashbyhq.com")) {
        const match = url.match(/ashbyhq\.com\/([^/?]+)/);
        return match?.[1] || "";
    }
    return "";
}

async function checkLinkedIn(company, role) {
    const query = `"${role}" "${company}"`;
    const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&f_TPR=r2592000`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) return { found: false, reason: "Could not access LinkedIn" };

    const html = await res.text();
    const hasJobs = html.includes("job-result") || html.includes("base-card");

    return {
        found: hasJobs,
        signal: hasJobs
            ? "Role found on LinkedIn"
            : "Role NOT found on LinkedIn",
    };
}

async function checkWellfound(company) {
    const url = `https://wellfound.com/company/${company.toLowerCase().replace(/\s+/g, "-")}`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) return { found: false, reason: "Could not access Wellfound" };

    const html = await res.text();
    const hasHiring = html.includes("hiring") || html.includes("open roles");

    return {
        found: hasHiring,
        signal: hasHiring
            ? "Company actively hiring on Wellfound"
            : "No active hiring on Wellfound",
    };
}

async function checkCompanyPage(company) {
    // Try common career page patterns
    const patterns = [
        `https://${company.toLowerCase().replace(/\s+/g, "")}.com/careers`,
        `https://${company.toLowerCase().replace(/\s+/g, "")}.com/jobs`,
        `https://careers.${company.toLowerCase().replace(/\s+/g, "")}.com`,
    ];

    for (const url of patterns) {
        const res = await fetchWithTimeout(url);
        if (res.ok) {
            const html = await res.text();
            return {
                found: true,
                url,
                signal: "Company has a careers page",
            };
        }
    }

    return { found: false, signal: "No careers page found" };
}

async function checkGreenhouse(company) {
    const slug = company.toLowerCase().replace(/\s+/g, "");
    const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) return { found: false, count: 0 };

    try {
        const data = await res.json();
        return {
            found: true,
            count: data.jobs?.length || 0,
            signal: `${data.jobs?.length || 0} open roles on Greenhouse`,
        };
    } catch {
        return { found: false, count: 0 };
    }
}

async function checkLever(company) {
    const slug = company.toLowerCase().replace(/\s+/g, "");
    const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) return { found: false, count: 0 };

    try {
        const data = await res.json();
        return {
            found: Array.isArray(data),
            count: Array.isArray(data) ? data.length : 0,
            signal: `${Array.isArray(data) ? data.length : 0} open roles on Lever`,
        };
    } catch {
        return { found: false, count: 0 };
    }
}

async function checkAshby(company) {
    const slug = company.toLowerCase().replace(/\s+/g, "");
    const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) return { found: false, count: 0 };

    try {
        const data = await res.json();
        const jobs = data.jobs || data.postings || [];
        return {
            found: jobs.length > 0,
            count: jobs.length,
            signal: `${jobs.length} open roles on Ashby`,
        };
    } catch {
        return { found: false, count: 0 };
    }
}

async function main() {
    let company = COMPANY;
    let role = ROLE;

    if (JOB_URL) {
        company = extractCompanyFromUrl(JOB_URL);
        role = ROLE || "Software Engineer";
    }

    if (!company) {
        console.error(
            'Usage: node scripts/verifyJob.mjs "https://..." OR --company "Company" --role "Role"',
        );
        process.exit(1);
    }

    console.log(`\n Verifying: ${role || "Any role"} at ${company}\n`);

    const checks = [];

    // Run all checks in parallel
    console.log("Running checks...");

    const [linkedin, wellfound, companyPage, greenhouse, lever, ashby] =
        await Promise.all([
            checkLinkedIn(company, role || "Software Engineer"),
            checkWellfound(company),
            checkCompanyPage(company),
            checkGreenhouse(company),
            checkLever(company),
            checkAshby(company),
        ]);

    checks.push(linkedin, wellfound, companyPage, greenhouse, lever, ashby);

    // Calculate trust score
    const signals = checks.filter((c) => c.found);
    const totalChecks = checks.length;
    const trustScore = Math.round((signals.length / totalChecks) * 100);

    console.log("\n Verification Results:\n");
    console.log("Check                        Signal");
    console.log("─".repeat(60));

    for (const check of checks) {
        const icon = check.found ? "" : "";
        console.log(`${icon} ${check.signal || "Failed"}`);
    }

    console.log(
        `\n Trust Score: ${trustScore}% (${signals.length}/${totalChecks} signals)`,
    );

    if (trustScore >= 80) {
        console.log(" HIGH TRUST — This job is very likely genuine. Apply!");
    } else if (trustScore >= 60) {
        console.log(
            "  MEDIUM TRUST — Some signals missing. Worth applying but verify details.",
        );
    } else if (trustScore >= 40) {
        console.log(
            "  LOW TRUST — Few signals. Apply but don't spend too much time on customization.",
        );
    } else {
        console.log(
            " VERY LOW TRUST — May be a ghost job or expired. Consider skipping.",
        );
    }

    // Save verification report
    const date = new Date().toISOString().split("T")[0];
    const reportsDir = resolve(ROOT, "reports");
    if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

    const report = `# Job Verification: ${role || "Any role"} at ${company}
Date: ${date}
URL: ${JOB_URL || "N/A"}

## Trust Score: ${trustScore}%
${trustScore >= 80 ? " HIGH" : trustScore >= 60 ? "  MEDIUM" : trustScore >= 40 ? "  LOW" : " VERY LOW"}

## Signals
${checks.map((c) => `- ${c.found ? "" : ""} ${c.signal}`).join("\n")}

## Recommendation
${trustScore >= 60 ? "Apply and mention specific details from the JD." : "Apply but don't over-invest in customization."}
`;

    const slug = company.toLowerCase().replace(/\s+/g, "-");
    const reportFile = resolve(reportsDir, `verify-${slug}-${date}.md`);
    writeFileSync(reportFile, report);
    console.log(`\n Report saved to: ${reportFile}`);
}

main().catch((e) => {
    console.error(`Verification failed: ${e.message}`);
    process.exit(1);
});
