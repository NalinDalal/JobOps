#!/usr/bin/env bun
/**
 * index.ts — JobOps CLI entry point (Bun-native, flat lib/)
 *
 * Usage:
 *   bun run index.ts <command> [options]
 *   jobops <command> [options]   # after `bun link`
 */

import { resolve } from "path";

const ROOT = resolve(import.meta.dir);

// ─── Commands ─────────────────────────────────────────────────

const COMMANDS = [
  "digest",
  "evaluate",
  "tailor",
  "tracker",
  "scan",
  "research",
  "outreach",
  "status",
  "help",
] as const;

type Command = (typeof COMMANDS)[number];

// ─── Help ─────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
JobOps — AI Job Hunting Agent

Usage:
  jobops <command> [options]

Commands:
  digest        Run daily job digest
  evaluate      Evaluate a job via Cloudflare AI
  tailor        Tailor CV for a specific job
  tracker       Manage application tracker
  scan          Scan job boards
  research      Research accelerator companies
  outreach      Generate outreach DM/email drafts
  status        Show system configuration status
  help          Show this help

Examples:
  jobops digest --query "frontend engineer" --mode preview
  jobops digest --mode daily --send
  jobops evaluate --company "Acme" --role "Engineer"
  jobops tailor --company "Acme" --role "Engineer"
  jobops tracker list
  jobops tracker add --company "Acme" --role "Engineer"
  jobops scan --query "react developer"
  jobops research --accelerator yc
  jobops outreach --company "Acme" --role "Engineer" --format short-dm
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
    } else if (!parsed._) {
      parsed._ = arg;
    } else if (!parsed._2) {
      parsed._2 = arg;
    } else if (!parsed._3) {
      parsed._3 = arg;
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
      const { main } = await import("./lib/digest");
      await main(args);
      break;
    }

    case "evaluate": {
      const { evaluateJob } = await import("./lib/evaluate");
      const company = String(args.company || "");
      const role = String(args.role || "");
      if (!company || !role) {
        console.error("Usage: evaluate --company <company> --role <role>");
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
        console.log("Evaluation failed — check Cloudflare credentials");
      }
      break;
    }

    case "tailor": {
      const { runTailor } = await import("./lib/tailor");
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
      const { runTracker } = await import("./lib/tracker");
      await runTracker(args);
      break;
    }

    case "scan": {
      const { scanJobs } = await import("./lib/scan");
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

    case "research": {
      const { researchAccelerators } = await import("./lib/research");
      const acceleratorSlug = String(args.accelerator || "");
      const batch = String(args.batch || "");
      const maxPerAccelerator = parseInt(String(args.max || "20"), 10) || 20;
      await researchAccelerators({
        acceleratorSlug: acceleratorSlug || undefined,
        batch: batch || undefined,
        maxPerAccelerator,
        output: true,
      });
      break;
    }

    case "outreach": {
      const { generateOutreach } = await import("./lib/outreach");
      const company = String(args.company || "");
      const role = String(args.role || "Engineer");
      const format = String(args.format || "short-dm") as
        | "short-dm"
        | "long-dm"
        | "email";
      if (!company) {
        console.error(
          "Usage: outreach --company <company> [--role <role>] [--format <short-dm|long-dm|email>]",
        );
        process.exit(1);
      }
      await generateOutreach({ company, role, format });
      break;
    }

    case "status": {
      const { loadEnv } = await import("./lib/config");
      const env = loadEnv(ROOT);
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
