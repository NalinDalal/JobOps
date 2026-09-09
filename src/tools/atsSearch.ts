/**
 * tools/atsSearch.ts — Search ATS boards directly via Google dorks
 *
 * Usage: bun run src/cli/index.ts atsSearch --query "software engineer" --location "India" --boards greenhouse,lever,ashby
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dir, "..", "..");

const ATS_BOARDS: Record<string, string> = {
    ashby: "jobs.ashbyhq.com",
    greenhouse: "boards.greenhouse.io",
    lever: "jobs.lever.co",
    icims: "careers.icims.com",
    jobvite: "jobs.jobvite.com",
    workday: "wd1.myworkdayjobs.com",
    bamboohr: "jobs.bamboohr.com",
    smartrecruiters: "jobs.smartrecruiters.com",
    jazzco: "apply.jazz.co",
    workable: "careers.workable.com",
};

interface JobListing {
    title: string;
    company: string;
    url: string;
    source: string;
}

function buildGoogleDorks(query: string, location: string, boardSlug: string, boardDomain: string): { query: string; url: string; directUrls: string[] } {
    const dorks: string[] = [];
    let searchQuery = `site:${boardSlug}`;

    if (query) {
        searchQuery += ` "${query}"`;
    }

    if (location && location !== "any") {
        searchQuery += ` "${location}"`;
    }

    const encoded = encodeURIComponent(searchQuery);
    const url = `https://www.google.com/search?q=${encoded}&num=20`;

    return {
        query: searchQuery,
        url,
        directUrls: getDirectSearchUrls(query, location, boardSlug),
    };
}

function getDirectSearchUrls(query: string, location: string, boardSlug: string): string[] {
    const urls: string[] = [];
    const encodedQuery = encodeURIComponent(query);
    const encodedLocation = encodeURIComponent(location || "");

    switch (boardSlug) {
        case "jobs.ashbyhq.com":
            urls.push(
                `https://jobs.ashbyhq.com/?query=${encodedQuery}${location ? `&location=${encodedLocation}` : ""}`,
            );
            break;
        case "boards.greenhouse.io":
            urls.push(
                `https://boards.greenhouse.io/embed/job_board?for=${encodedQuery}`,
            );
            break;
        case "jobs.lever.co":
            urls.push(
                `https://jobs.lever.co/search?q=${encodedQuery}${location ? `&location=${encodedLocation}` : ""}`,
            );
            break;
        default:
            if (boardSlug) {
                urls.push(`https://${boardSlug}/search?q=${encodedQuery}`);
            }
    }

    return urls;
}

function parseJobListings(html: string, board: string, domain: string): JobListing[] {
    const jobs: JobListing[] = [];

    const patterns = [
        /<a[^>]*href="(https:\/\/jobs\.ashbyhq\.com\/[^"]*)"[^>]*>([^<]*)<\/a>/gi,
        /<a[^>]*href="(https:\/\/boards\.greenhouse\.io\/[^"]*)"[^>]*>([^<]*)<\/a>/gi,
        /<a[^>]*href="(https:\/\/jobs\.lever\.co\/[^"]*)"[^>]*>([^<]*)<\/a>/gi,
        /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*class="[^"]*job[^"]*"[^>]*>([^<]*)<\/a>/gi,
        /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*class="[^"]*position[^"]*"[^>]*>([^<]*)<\/a>/gi,
        /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*class="[^"]*posting[^"]*"[^>]*>([^<]*)<\/a>/gi,
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const url = match[1];
            const title = match[2]?.trim();

            if (
                url &&
                title &&
                title.length > 3 &&
                !title.includes("Cookie") &&
                !title.includes("Sign")
            ) {
                let company = "";
                if (url.includes("ashbyhq.com")) {
                    company = url.split("ashbyhq.com/")[1]?.split("/")[0] || "";
                } else if (url.includes("greenhouse.io")) {
                    company =
                        url.split("greenhouse.io/")[1]?.split("/")[0] || "";
                } else if (url.includes("lever.co")) {
                    company = url.split("lever.co/")[1]?.split("/")[0] || "";
                }

                jobs.push({
                    title,
                    company: company.charAt(0).toUpperCase() + company.slice(1),
                    url,
                    source: board,
                });
            }
        }
    }

    return jobs;
}

export async function runAtsSearch(query: string, location: string, boardsArg: string): Promise<void> {
    const boards = boardsArg.split(",").map((b) => b.trim());

    console.log(`\n ATS Board Search`);
    console.log(`   Query: "${query}"`);
    console.log(`   Location: ${location || "any"}`);
    console.log(`   Boards: ${boards.join(", ")}`);

    const allJobs: JobListing[] = [];

    for (const board of boards) {
        const domain = ATS_BOARDS[board];
        if (!domain) {
            console.error(`Unknown board: ${board}`);
            continue;
        }

        const dork = buildGoogleDorks(query, location, board, domain);

        console.log(`\n Searching ${board} (${domain})...`);
        console.log(`   Query: ${dork.query}`);
        console.log(`   Direct: ${dork.directUrls[0]}`);

        for (const url of dork.directUrls) {
            try {
                const res = await fetch(url, {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                        Accept: "text/html",
                    },
                    signal: AbortSignal.timeout(10000),
                });

                if (res.ok) {
                    const html = await res.text();
                    const parsed = parseJobListings(html, board, domain);
                    allJobs.push(...parsed);
                    console.log(`    Found ${parsed.length} listings`);
                } else {
                    console.log(
                        `     HTTP ${res.status} — may need browser access`,
                    );
                }
            } catch (e) {
                console.log(`     ${(e as Error).message}`);
            }
        }
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = allJobs.filter((j) => {
        if (seen.has(j.url)) return false;
        seen.add(j.url);
        return true;
    });

    console.log(
        `\n Total: ${unique.length} unique listings across ${boards.length} boards`,
    );

    if (unique.length > 0) {
        console.log("\nJobs found:\n");
        unique.forEach((j, i) => {
            console.log(`  ${i + 1}. ${j.title} @ ${j.company}`);
            console.log(`     ${j.url}`);
            console.log(`     Source: ${j.source}`);
        });
    }

    // Save results
    const date = new Date().toISOString().split("T")[0];
    const resultsDir = resolve(ROOT, "data");
    if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });
    const resultsFile = resolve(resultsDir, `atsSearch-${date}.json`);
    writeFileSync(resultsFile, JSON.stringify(unique, null, 2));
    console.log(`\n Results saved to: ${resultsFile}`);

    // Print Google dorks for manual search
    console.log("\n Google Dorks for manual search:\n");
    for (const board of boards) {
        const domain = ATS_BOARDS[board];
        if (domain) {
            let dork = `site:${domain} "${query}"`;
            if (location && location !== "any") dork += ` "${location}"`;
            console.log(`  ${dork}`);
        }
    }
}
