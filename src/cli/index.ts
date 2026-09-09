/**
 * cli/index.ts — CLI entry point
 *
 * Parses commands and dispatches to appropriate handlers.
 * This is the only CLI boundary — all process.argv parsing lives here.
 *
 * Supported commands:
 *   digest, evaluate, tailor, tracker, scan, status, help
 */

import { resolve } from "path";
import { loadEnv } from "../config/env";

const ROOT = resolve(import.meta.dir, "..", "..");

// ─── Commands ─────────────────────────────────────────────────

const COMMANDS = [
    "digest",
    "evaluate",
    "tailor",
    "tracker",
    "scan",
    "status",
    "help",
] as const;

type Command = (typeof COMMANDS)[number];

// ─── Help ─────────────────────────────────────────────────────

function printHelp(): void {
    console.log(`
JobOps — AI Job Hunting Agent

Usage:
  bun run src/cli/index.ts <command> [options]

Commands:
  digest        Run daily job digest
  evaluate      Evaluate a job via Cloudflare AI
  tailor        Tailor CV for a specific job
  tracker       Manage application tracker
  scan          Scan job boards
  status        Show system configuration status
  help          Show this help

Examples:
  bun run src/cli/index.ts digest --query "frontend engineer" --mode preview
  bun run src/cli/index.ts digest --mode daily --send
  bun run src/cli/index.ts evaluate --company "Acme" --role "Engineer"
  bun run src/cli/index.ts tailor --company "Acme" --role "Engineer"
  bun run src/cli/index.ts tracker list
  bun run src/cli/index.ts tracker add --company "Acme" --role "Engineer"
  bun run src/cli/index.ts scan --query "react developer"
`);
}

// ─── Arg parsing ──────────────────────────────────────────────

function parseArgs(args: string[]): Record<string, string | boolean> {
    const parsed: Record<string, string | boolean> = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        if (arg.startsWith("--")) {
            const key = arg.slice(2);
            const next = args[i + 1];
            if (next && !next.startsWith("--")) {
                parsed[key] = next;
                i++;
            } else {
                parsed[key] = true;
            }
        }
    }
    return parsed;
}

// ─── Command dispatch ─────────────────────────────────────────

async function runCommand(
    command: Command,
    args: Record<string, string | boolean>,
): Promise<void> {
    switch (command) {
        case "digest": {
            const { runDigest } = await import("../digest/index");
            await runDigest(args);
            break;
        }

        case "evaluate": {
            const { evaluateJob } = await import("../pipeline/evaluate");
            const company = String(args.company || "");
            const role = String(args.role || "");
            if (!company || !role) {
                console.error(
                    "Usage: evaluate --company <company> --role <role>",
                );
                process.exit(1);
            }
            const job = {
                id: "",
                source: "unknown" as const,
                title: role,
                company,
                url: "",
                description: String(args.description || ""),
                remote: true,
            };
            const result = await evaluateJob(job);
            if (result) {
                console.log(JSON.stringify(result, null, 2));
            } else {
                console.log("Evaluation failed");
            }
            break;
        }

        case "tailor": {
            const { runTailor } = await import("../tailor/index");
            const company = String(args.company || "");
            const role = String(args.role || "");
            const description = String(args.description || "");
            if (!company || !role) {
                console.error(
                    "Usage: tailor --company <company> --role <role> [--description <jd>]",
                );
                process.exit(1);
            }
            await runTailor({ company, role, description });
            break;
        }

        case "tracker": {
            const { runTracker } = await import("../tracker/index");
            await runTracker(args);
            break;
        }

        case "scan": {
            const { scanJobs } = await import("../pipeline/scan");
            const query = String(args.query || "software engineer");
            const result = await scanJobs({ query });
            console.log(
                `Found ${result.jobs.length} jobs from ${result.sources.length} sources`,
            );
            for (const job of result.jobs.slice(0, 10)) {
                console.log(
                    `- ${job.company}: ${job.title} (${job.location || "Remote"})`,
                );
            }
            break;
        }

        case "status": {
            const env = loadEnv();
            console.log("\nSystem Status:");
            console.log(
                `- Cloudflare AI: ${env.cloudflareApiKey ? "✓ Configured" : "✗ Not configured"}`,
            );
            console.log(
                `- Resend Email: ${env.resendApiKey ? "✓ Configured" : "✗ Not configured"}`,
            );
            console.log(
                `- SMTP: ${env.smtpUser ? "✓ Configured" : "✗ Not configured"}`,
            );
            console.log(`- Model: ${env.cloudflareModel}`);
            break;
        }

        case "help":
        default:
            printHelp();
    }
}

// ─── Entry point ──────────────────────────────────────────────

const args = process.argv.slice(2);
const command = (args[0] || "help") as string;

if (!COMMANDS.includes(command as Command)) {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

const parsed = parseArgs(args.slice(1));

runCommand(command as Command, parsed).catch((e) => {
    console.error(`Error: ${e}`);
    process.exit(1);
});
