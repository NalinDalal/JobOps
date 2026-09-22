/**
 * lib/research.ts — Accelerator company research
 *
 * Fetches company listings from accelerator pages (YC, MetaDAO, OrangeDAO, Alliance DAO).
 * Returns structured companies with website, careers URL hints, and tech stack tags.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { load as yamlLoad } from "js-yaml";
import type {
    AcceleratorCompany,
    AcceleratorResult,
    ResearchResult,
    RawAccelerator,
    RawResearchConfig,
} from "./types";
import { loadAcceleratorsConfig, ROOT } from "./config";
import { FETCH_TIMEOUT_MS } from "./constants";

const OUTPUT_DIR = resolve(ROOT, "output/research");

// ─── Fetcher ────────────────────────────────────────────────────

async function fetchWithTimeout(
    url: string,
    ms: number = FETCH_TIMEOUT_MS,
): Promise<string> {
    const res = await fetch(url, {
        headers: { "User-Agent": "JobOps/1.0" },
        signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
}

// ─── Parsers ────────────────────────────────────────────────────

function extractCompanyName(text: string): string | null {
    const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    for (const line of lines) {
        const cleaned = line.replace(/<[^>]*>/g, "").trim();
        if (
            cleaned.length > 2 &&
            cleaned.length < 80 &&
            !cleaned.startsWith("http") &&
            !cleaned.startsWith("#") &&
            !cleaned.startsWith("//")
        ) {
            const words = cleaned.split(/\s+/);
            if (words.length >= 1 && words.length <= 8) {
                const alphaCount = (cleaned.match(/[a-zA-Z]/g) || []).length;
                if (alphaCount / cleaned.length > 0.5) {
                    return cleaned;
                }
            }
        }
    }
    return null;
}

function extractUrl(text: string): string | null {
    const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/);
    return urlMatch ? urlMatch[0] : null;
}

function guessTechStack(text: string): string[] {
    const techKeywords: Record<string, string> = {
        rust: "Rust",
        solidity: "Solidity",
        typescript: "TypeScript",
        javascript: "JavaScript",
        python: "Python",
        go: "Go",
        react: "React",
        next: "Next.js",
        node: "Node.js",
        elixir: "Elixir",
        ruby: "Ruby",
        swift: "Swift",
        kotlin: "Kotlin",
        "c++": "C++",
        ai: "AI/ML",
        "machine learning": "AI/ML",
        llm: "LLMs",
        voice: "Voice AI",
        agent: "AI Agents",
        blockchain: "Blockchain",
        defi: "DeFi",
        web3: "Web3",
        "smart contract": "Smart Contracts",
        dao: "DAO",
        nft: "NFT",
        protocol: "Protocol",
        infrastructure: "Infrastructure",
        devops: "DevOps",
        kubernetes: "Kubernetes",
        docker: "Docker",
        aws: "AWS",
        postgres: "PostgreSQL",
        redis: "Redis",
    };

    const lower = text.toLowerCase();
    const found: string[] = [];
    for (const [keyword, tech] of Object.entries(techKeywords)) {
        if (lower.includes(keyword) && !found.includes(tech)) {
            found.push(tech);
        }
    }
    return found.slice(0, 5);
}

function parseAcceleratorPage(
    html: string,
    accelerator: RawAccelerator,
    maxCompanies: number,
): AcceleratorCompany[] {
    const companies: AcceleratorCompany[] = [];
    const seen = new Set<string>();

    const blocks = html.split(/<div[^>]*>/i);
    for (const block of blocks) {
        if (companies.length >= maxCompanies) break;

        const text = block
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        const name = extractCompanyName(text);
        if (!name || seen.has(name.toLowerCase())) continue;

        const url = extractUrl(block) || extractUrl(text);
        const techStack = guessTechStack(
            text + " " + (accelerator.tags || []).join(" "),
        );

        seen.add(name.toLowerCase());
        companies.push({
            name,
            url:
                url ||
                `${accelerator.company_list_url}/${name.toLowerCase().replace(/\s+/g, "-")}`,
            careersUrl: accelerator.careers_pattern.replace(
                "{slug}",
                name.toLowerCase().replace(/\s+/g, "-"),
            ),
            accelerator: accelerator.name,
            batch: accelerator.batch_urls[0]?.batch || "unknown",
            tags: accelerator.tags || [],
            techStack,
            description: text.substring(0, 200),
        });
    }

    return companies;
}

// ─── Research Runner ────────────────────────────────────────────

export async function researchAccelerators(
    options: {
        acceleratorSlug?: string;
        batch?: string;
        maxPerAccelerator?: number;
        output?: boolean;
    } = {},
): Promise<ResearchResult> {
    const config = loadAcceleratorsConfig();
    const maxPerAccelerator = options.maxPerAccelerator || 20;

    const result: ResearchResult = {
        accelerators: [],
        totalCompanies: 0,
        errors: [],
        timestamp: new Date().toISOString(),
    };

    const accelerators = config.accelerators.filter((a) => {
        if (options.acceleratorSlug && a.slug !== options.acceleratorSlug)
            return false;
        return a.enabled !== false;
    });

    console.log(`Researching ${accelerators.length} accelerators...`);

    for (const accelerator of accelerators) {
        const accResult: AcceleratorResult = {
            name: accelerator.name,
            slug: accelerator.slug,
            batch:
                options.batch || accelerator.batch_urls[0]?.batch || "unknown",
            companies: [],
            error: undefined,
        };

        try {
            const batchesToFetch = options.batch
                ? accelerator.batch_urls.filter(
                      (b) => b.batch === options.batch,
                  )
                : accelerator.batch_urls;

            if (batchesToFetch.length === 0) {
                accResult.error = `No batch "${options.batch}" found for ${accelerator.name}`;
                result.errors.push(accResult.error);
                result.accelerators.push(accResult);
                continue;
            }

            for (const batch of batchesToFetch) {
                try {
                    console.log(
                        `  Fetching ${accelerator.name} (${batch.label})...`,
                    );
                    const html = await fetchWithTimeout(batch.url);
                    const companies = parseAcceleratorPage(
                        html,
                        accelerator,
                        maxPerAccelerator,
                    );

                    for (const company of companies) {
                        if (
                            !accResult.companies.find(
                                (c: AcceleratorCompany) =>
                                    c.name === company.name,
                            )
                        ) {
                            accResult.companies.push(company);
                        }
                    }
                } catch (e) {
                    const err = `Failed to fetch ${accelerator.name} ${batch.label}: ${e}`;
                    console.warn(`  ${err}`);
                    if (!accResult.error) accResult.error = err;
                    result.errors.push(err);
                }
            }

            result.totalCompanies += accResult.companies.length;
        } catch (e) {
            const err = `Failed to research ${accelerator.name}: ${e}`;
            accResult.error = err;
            result.errors.push(err);
        }

        result.accelerators.push(accResult);
    }

    if (options.output !== false && result.totalCompanies > 0) {
        if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
        const timestamp = new Date().toISOString().split("T")[0];
        const outputPath = resolve(OUTPUT_DIR, `research-${timestamp}.json`);
        writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`\nResearch saved to: ${outputPath}`);
    }

    console.log(`\nResearch Summary:`);
    console.log(`  Accelerators: ${result.accelerators.length}`);
    console.log(`  Total companies found: ${result.totalCompanies}`);
    if (result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.length}`);
    }

    for (const acc of result.accelerators) {
        console.log(
            `\n  ${acc.name} (${acc.batch}): ${acc.companies.length} companies`,
        );
        for (const company of acc.companies.slice(0, 10)) {
            console.log(
                `    - ${company.name} | Tags: ${(company.tags || []).slice(0, 3).join(", ")} | Tech: ${(company.techStack || []).slice(0, 3).join(", ")}`,
            );
        }
        if (acc.companies.length > 10) {
            console.log(`    ... and ${acc.companies.length - 10} more`);
        }
    }

    return result;
}

// ─── CLI entry point ────────────────────────────────────────────

if (import.meta.main) {
    const args = process.argv.slice(2);
    const acceleratorSlug = args.find((a) => !a.startsWith("--")) || undefined;
    const batch =
        args.find((a) => a.startsWith("--batch="))?.slice(7) || undefined;
    const maxPerAccelerator = parseInt(
        args.find((a) => a.startsWith("--max="))?.slice(6) || "20",
        10,
    );

    researchAccelerators({
        acceleratorSlug,
        batch,
        maxPerAccelerator,
        output: true,
    }).catch((e) => {
        console.error(`Research failed: ${e}`);
        process.exit(1);
    });
}
