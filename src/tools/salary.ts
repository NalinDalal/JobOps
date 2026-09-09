/**
 * tools/salary.ts — Salary lookup from local data files
 *
 * Usage: bun run src/cli/index.ts salary "Software Engineer" ["India"]
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dir, "..", "..");
const SALARY_DIR = resolve(ROOT, "data/salary");

interface SalaryRole {
    title: string;
    min?: number;
    max?: number;
    median?: number;
    currency?: string;
    source?: string;
}

interface SalaryFile {
    region: string;
    roles: SalaryRole[];
}

interface BestMatch extends SalaryRole {
    region: string;
    file: string;
}

export function lookupSalary(title: string, region?: string): BestMatch | null {
    if (!existsSync(SALARY_DIR)) return null;

    const files = readdirSync(SALARY_DIR).filter((f) => f.endsWith(".json"));
    let best: (SalaryRole & { region: string; file: string }) | null = null;

    for (const file of files) {
        try {
            const raw = readFileSync(resolve(SALARY_DIR, file), "utf-8");
            const data = JSON.parse(raw) as SalaryFile;
            const fileRegion = (data.region || "").toLowerCase();

            if (region && !fileRegion.includes(region.toLowerCase()) && !region.toLowerCase().includes(fileRegion)) {
                continue;
            }

            for (const role of data.roles || []) {
                const roleTitle = role.title.toLowerCase();
                if (roleTitle.includes(title.toLowerCase()) || title.toLowerCase().includes(roleTitle)) {
                    if (!best || (role.median || 0) > (best.median || 0)) {
                        best = { ...role, region: data.region, file };
                    }
                }
            }
        } catch (e) {
            console.warn(`Warning: Could not parse ${file}: ${(e as Error).message}`);
        }
    }

    return best || null;
}

export function main(): void {
    const args = process.argv.slice(2);
    const title = args[0];
    const region = args[1];

    if (!title) {
        console.error('Usage: salary "Software Engineer" ["India"]');
        process.exit(1);
    }

    const result = lookupSalary(title, region);

    if (!result) {
        console.log(
            `No salary data found for "${title}"${region ? ` in "${region}"` : ""}.`,
        );
        console.log(
            "Add data to data/salary/*.json following the schema in docs/customization.md.",
        );
        return;
    }

    console.log(
        JSON.stringify(
            {
                title: result.title,
                region: result.region,
                currency: result.currency,
                min: result.min,
                max: result.max,
                median: result.median,
                source: result.source,
            },
            null,
            2,
        ),
    );
}
