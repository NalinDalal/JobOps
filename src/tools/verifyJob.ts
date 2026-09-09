/**
 * tools/verifyJob.ts — Verify if a job posting is genuine
 *
 * Cross-checks across multiple platforms to avoid ghost jobs.
 *
 * Usage: bun run src/cli/index.ts verifyJob --company "Company" --role "Role"
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dir, "..", "..");

interface CheckResult {
    found: boolean;
    signal?: string;
    reason?: string;
    count?: number;
    url?: string;
    ok?: boolean;
    status?: number;
}

interface VerifyOptions {
    url?: string;
    company?: string;
    role?: string;
}

function extractCompanyFromUrl(url: string): string {
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

async function fetchWithTimeout(url: string, timeout = 10000): Promise<CheckResult> {
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                Accept: "text/html,application/json",
            },
            signal: AbortSignal.timeout(timeout),
        });
        return { found: res.ok, ok: res.ok, status: res.status, url };
    } catch (e) {
        return { found: false, ok: false, status: 0, reason: (e as Error).message };
    }
}

async function checkLinkedIn(company: string, role: string): Promise<CheckResult> {
    const query = `"${role}" "${company}"`;
    const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&f_TPR=r2592000`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) return { found: false, reason: "Could not access LinkedIn" };

    const html = await fetch(url, { headers: { Accept: "text/html" } }).then(r => r.text());
    const hasJobs = html.includes("job-result") || html.includes("base-card");

    return {
        found: hasJobs,
        signal: hasJobs
            ? "Role found on LinkedIn"
            : "Role NOT found on LinkedIn",
    };
}

async function checkWellfound(company: string): Promise<CheckResult> {
    const url = `https://wellfound.com/company/${company.toLowerCase().replace(/\s+/g, "-")}`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) return { found: false, reason: "Could not access Wellfound" };

    const html = await fetch(url, { headers: { Accept: "text/html" } }).then(r => r.text());
    const hasHiring = html.includes("hiring") || html.includes("open roles");

    return {
        found: hasHiring,
        signal: hasHiring
            ? "Company actively hiring on Wellfound"
            : "No active hiring on Wellfound",
    };
}

async function checkCompanyPage(company: string): Promise<CheckResult> {
    const patterns = [
        `https://${company.toLowerCase().replace(/\s+/g, "")}.com/careers`,
        `https://${company.toLowerCase().replace(/\s+/g, "")}.com/jobs`,
        `https://careers.${company.toLowerCase().replace(/\s+/g, "")}.com`,
    ];

    for (const url of patterns) {
        const res = await fetchWithTimeout(url);
        if (res.ok) {
            return {
                found: true,
                url,
                signal: "Company has a careers page",
            };
        }
    }

    return { found: false, signal: "No careers page found" };
}

async function checkGreenhouse(company: string): Promise<CheckResult> {
    const slug = company.toLowerCase().replace(/\s+/g, "");
    const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) return { found: false, count: 0 };

    try {
        const data = await fetch(url, { headers: { Accept: "application/json" } }).then(r => r.json());
        return {
            found: (data.jobs?.length || 0) > 0,
            count: data.jobs?.length || 0,
            signal: `${data.jobs?.length || 0} open roles on Greenhouse`,
        };
    } catch {
        return { found: false, count: 0 };
    }
}

async function checkLever(company: string): Promise<CheckResult> {
    const slug = company.toLowerCase().replace(/\s+/g, "");
    const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) return { found: false, count: 0 };

    try {
        const data = await fetch(url, { headers: { Accept: "application/json" } }).then(r => r.json());
        const count = Array.isArray(data) ? data.length : 0;
        return {
            found: count > 0,
            count,
            signal: `${count} open roles on Lever`,
        };
    } catch {
        return { found: false, count: 0 };
    }
}

async function checkAshby(company: string): Promise<CheckResult> {
    const slug = company.toLowerCase().replace(/\s+/g, "");
    const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) return { found: false, count: 0 };

    try {
        const data = await fetch(url, { headers: { Accept: "application/json" } }).then(r => r.json());
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

export async function runVerifyJob(options: VerifyOptions = {}): Promise<void> {
    let company = options.company;
    let role = options.role;

    if (options.url) {
        company = extractCompanyFromUrl(options.url);
        role = role || "Software Engineer";
    }

    if (!company) {
        console.error(
            'Usage: verifyJob --company "Company" --role "Role" OR verifyJob --url "https://..."',
        );
        process.exit(1);
    }

    console.log(`\n Verifying: ${role || "Any role"} at ${company}\n`);

    const checks: CheckResult[] = [];

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
        const icon = check.found ? "✓" : "✗";
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
            "  LOW TRUST — Few signals. Apply but don't over-invest in customization.",
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
URL: ${options.url || "N/A"}

## Trust Score: ${trustScore}%
${trustScore >= 80 ? " HIGH" : trustScore >= 60 ? "  MEDIUM" : trustScore >= 40 ? "  LOW" : " VERY LOW"}

## Signals
${checks.map((c) => `- ${c.found ? "✓" : "✗"} ${c.signal}`).join("\n")}

## Recommendation
${trustScore >= 60 ? "Apply and mention specific details from the JD." : "Apply but don't over-invest in customization."}
`;

    const slug = company.toLowerCase().replace(/\s+/g, "-");
    const reportFile = resolve(reportsDir, `verify-${slug}-${date}.md`);
    writeFileSync(reportFile, report);
    console.log(`\n Report saved to: ${reportFile}`);
}
