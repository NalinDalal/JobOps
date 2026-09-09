/**
 * tools/doctor.ts — System health check
 *
 * Validates all prerequisites are met.
 *
 * Usage: bun run src/cli/index.ts status
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dir, "..", "..");

let healthy = true;
const issues: { name: string; fix: string }[] = [];

function check(name: string, condition: boolean, fix: string): void {
    if (condition) {
        console.log(`   ${name}`);
    } else {
        console.log(`   ${name}`);
        issues.push({ name, fix });
        healthy = false;
    }
}

export function runDoctor(): void {
    console.log("\n JobOps Health Check\n");

    let activeModel = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

    // 1. Bun runtime
    check(
        "Bun runtime installed",
        typeof Bun !== "undefined",
        "Install Bun from bun.sh",
    );

    // 2. .env file
    const envPath = resolve(ROOT, ".env");
    check(
        ".env file exists",
        existsSync(envPath),
        "Copy .env.example to .env and fill in your keys",
    );

    if (existsSync(envPath)) {
        const env = readFileSync(envPath, "utf-8");
        const hasKey =
            env.includes("CLOUDFLARE_API_KEY=") &&
            !env.includes("CLOUDFLARE_API_KEY=your_");
        const hasAccount =
            env.includes("CLOUDFLARE_ACCOUNT_ID=") &&
            !env.includes("CLOUDFLARE_ACCOUNT_ID=your_");
        check("Cloudflare API key set", hasKey, "Set CLOUDFLARE_API_KEY in .env");
        check(
            "Cloudflare account ID set",
            hasAccount,
            "Set CLOUDFLARE_ACCOUNT_ID in .env",
        );

        const modelMatch = env.match(/^CLOUDFLARE_MODEL=(.*)$/m);
        if (
            modelMatch &&
            modelMatch[1] &&
            modelMatch[1].trim() &&
            !modelMatch[1].includes("your_")
        ) {
            activeModel = modelMatch[1].trim();
        }
    }

    console.log(`\n  Active Cloudflare model: ${activeModel}`);

    // 4. Profile
    const profilePath = resolve(ROOT, "config/profile.yml");
    check(
        "Profile configured",
        existsSync(profilePath),
        "Run: cp config/profile.example.yml config/profile.yml",
    );

    // 5. CV
    const cvPath = resolve(ROOT, "config/cv.md");
    check(
        "CV exists",
        existsSync(cvPath),
        "Create config/cv.md with your CV in markdown",
    );

    // 6. Data directory
    const dataPath = resolve(ROOT, "data");
    check("Data directory exists", existsSync(dataPath), "Run: mkdir data");

    // 7. Output directory
    const outputPath = resolve(ROOT, "output");
    check("Output directory exists", existsSync(outputPath), "Run: mkdir output");

    console.log("\n" + "─".repeat(50));

    if (healthy) {
        console.log("\n All checks passed! Ready to hunt jobs.\n");
        console.log('Try: bun run src/cli/index.ts scan "software engineer" "Remote"');
    } else {
        console.log(`\n  ${issues.length} issue(s) found:\n`);
        for (const issue of issues) {
            console.log(`  • ${issue.name}: ${issue.fix}`);
        }
        console.log("");
    }
}
