/**
 * cli/index.ts — CLI entry point
 *
 * Parses commands and dispatches to appropriate handlers.
 */

import { resolve } from "path";
import { loadEnv } from "../config/env.js";

const ROOT = resolve(import.meta.dir, "..", "..");

// Commands
const COMMANDS: string[] = [
  "digest",
  "evaluate",
  "tailor",
  "tracker",
  "scan",
  "rank",
  "interview",
  "upskill",
  "salary",
  "atsSearch",
  "verifyJob",
  "emailOutreach",
  "status",
  "help",
];

type Command = (typeof COMMANDS)[number];

function printHelp(): void {
  console.log(`
JobOps — AI Job Hunting Agent

Usage:
  bun run src/cli <command> [options]

Commands:
  digest        Run daily job digest
  evaluate      Evaluate a job
  tailor        Tailor CV for a job
  tracker       Manage application tracker
  scan          Scan job boards
  rank          Rank and evaluate jobs
  interview     Generate interview prep pack
  upskill       Analyze skill gaps
  salary        Look up salary
  atsSearch     Search ATS boards via Google dorks
  verifyJob     Verify if a job is genuine
  emailOutreach Direct email outreach (not yet implemented)
  status        Show system status
  help          Show this help

Examples:
  bun run src/cli digest --query "frontend engineer" --mode preview
  bun run src/cli evaluate --company "Acme" --role "Engineer"
  bun run src/cli tailor --company "Acme" --role "Engineer"
  bun run src/cli tracker list
  bun run src/cli scan --query "react developer"
  bun run src/cli rank --query "software engineer" --location "Remote"
  `);
}

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

async function runCommand(command: Command, args: Record<string, string | boolean>): Promise<void> {
  switch (command) {
    case "digest": {
      const { runDigest } = await import("../digest/index.js");
      await runDigest(args);
      break;
    }
    case "evaluate": {
      const { evaluateJob } = await import("../pipeline/evaluate.js");
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
        console.log("Evaluation failed");
      }
      break;
    }
    case "tailor": {
      const { runTailor } = await import("../tailor/index.js");
      const company = String(args.company || "");
      const role = String(args.role || "");
      const description = String(args.description || "");
      if (!company || !role) {
        console.error("Usage: tailor --company <company> --role <role> [--description <jd>]");
        process.exit(1);
      }
      await runTailor({ company, role, description });
      break;
    }
    case "rank": {
      const { scanJobs, evaluateJobs, rankJobs } = await import("../pipeline/index.js");
      const query = String(args.query || "software engineer");
      const location = String(args.location || "Remote");
      const limit = Number(args.limit || 20);
      const minScore = Number(args.minScore || 0);
      console.log(`Ranking jobs for: ${query} in ${location}...`);
      const scanResult = await scanJobs({ query, location });
      const jobs = scanResult.jobs;
      console.log(`Scanned ${jobs.length} jobs. Evaluating...`);
      await evaluateJobs(jobs, { concurrent: Math.min(jobs.length, 5) });
      const ranked = rankJobs(jobs, { minScore });
      const filtered = ranked.strongMatches
        .concat(ranked.worthReviewing)
        .filter((j) => (j.evaluation?.overall || 0) >= minScore)
        .slice(0, limit);
      console.log(`\nRanked ${filtered.length} jobs:\n`);
      console.log(JSON.stringify(filtered, null, 2));
      break;
    }
    case "tracker": {
      const { runTracker } = await import("../tracker/index.js");
      await runTracker(args);
      break;
    }
    case "scan": {
      const { scanJobs } = await import("../pipeline/scan.js");
      const query = String(args.query || "software engineer");
      const result = await scanJobs({ query });
      console.log(`Found ${result.jobs.length} jobs from ${result.sources.length} sources`);
      for (const job of result.jobs.slice(0, 10)) {
        console.log(`- ${job.company}: ${job.title} (${job.location || "Remote"})`);
      }
      break;
    }
    case "status": {
      const env = loadEnv();
      console.log("\nSystem Status:");
      console.log(`- Cloudflare AI: ${env.cloudflareApiKey ? "✓ Configured" : "✗ Not configured"}`);
      console.log(`- Resend Email: ${env.resendApiKey ? "✓ Configured" : "✗ Not configured"}`);
      console.log(`- SMTP: ${env.smtpUser ? "✓ Configured" : "✗ Not configured"}`);
      console.log(`- Model: ${env.cloudflareModel}`);
      const { runDoctor } = await import("../tools/doctor.js");
      await runDoctor();
      break;
    }
    case "interview": {
      const { runInterview } = await import("../tools/interview.js");
      const company = String(args.company || "");
      const stage = String(args.stage || "Technical");
      if (!company) {
        console.error("Usage: interview --company <company> --stage <stage>");
        process.exit(1);
      }
      await runInterview({ company, stage });
      break;
    }
    case "upskill": {
      const { runUpskill } = await import("../tools/upskill.js");
      const query = String(args.query || "software engineer");
      const limit = Number(args.limit || 20);
      await runUpskill({ query, limit });
      break;
    }
    case "salary": {
      const { lookupSalary } = await import("../tools/salary.js");
      const title = String(args.title || args._ || "");
      const region = String(args.region || "");
      if (!title) {
        console.error('Usage: salary "Software Engineer" ["India"]');
        process.exit(1);
      }
      const result = lookupSalary(title, region);
      if (result) {
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
      } else {
        console.log(`No salary data found for "${title}"${region ? ` in "${region}"` : ""}.`);
      }
      break;
    }
    case "atsSearch": {
      const { runAtsSearch } = await import("../tools/atsSearch.js");
      const query = String(args.query || "software engineer");
      const location = String(args.location || "");
      const boards = String(args.boards || "ashby,greenhouse,lever");
      await runAtsSearch(query, location, boards);
      break;
    }
    case "verifyJob": {
      const { runVerifyJob } = await import("../tools/verifyJob.js");
      const company = String(args.company || "");
      const role = String(args.role || "");
      const url = String(args.url || "");
      await runVerifyJob({ company, role, url });
      break;
    }
    case "emailOutreach": {
      console.log("Email outreach command not yet implemented");
      break;
    }
    case "challenge": {
      console.log("Challenge command not yet implemented");
      break;
    }
    case "habits": {
      console.log("Habits command not yet implemented");
      break;
    }
    case "reverseEngineer": {
      console.log("Reverse engineer command not yet implemented");
      break;
    }
    case "loomOutreach": {
      console.log("Loom outreach command not yet implemented");
      break;
    }
    case "htmlReport": {
      console.log("HTML report command not yet implemented");
      break;
    }
    case "profile": {
      console.log("Profile command not yet implemented");
      break;
    }
    case "discover": {
      console.log("Discover command not yet implemented");
      break;
    }
    case "status": {
      const env = loadEnv();
      console.log("\nSystem Status:");
      console.log(`- Cloudflare AI: ${env.cloudflareApiKey ? "✓ Configured" : "✗ Not configured"}`);
      console.log(`- Resend Email: ${env.resendApiKey ? "✓ Configured" : "✗ Not configured"}`);
      console.log(`- SMTP: ${env.smtpUser ? "✓ Configured" : "✗ Not configured"}`);
      console.log(`- Model: ${env.cloudflareModel}`);
      const { runDoctor } = await import("../tools/doctor.js");
      await runDoctor();
      break;
    }
    case "help":
    default:
      printHelp();
  }
}

// Main
const args = process.argv.slice(2);
const command = (args[0] || "help") as Command;
const rest = args.slice(1);

if (!COMMANDS.includes(command)) {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

const parsed = parseArgs(rest);

runCommand(command, parsed).catch((e) => {
  console.error(`Error: ${e}`);
  process.exit(1);
});
