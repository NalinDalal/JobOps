#!/usr/bin/env node

/**
 * cli.mjs — JobOps CLI entry point
 *
 * Usage:
 *   node cli.mjs scan "software engineer" "Remote"
 *   node cli.mjs evaluate '{"title":"...","company":"...","description":"..."}'
 *   node cli.mjs tailor '{"title":"...","company":"...","description":"..."}'
 *   node cli.mjs tracker list
 *   node cli.mjs tracker add "Company" "Role"
 *   node cli.mjs tracker interview "Company" "stage" "date"
 *   node cli.mjs tracker outcome "Company" "result"
 *   node cli.mjs tracker followup "Company" "note" "date"
 *   node cli.mjs tracker export
 *   node cli.mjs tracker report
 *   node cli.mjs report
 *   node cli.mjs doctor
 *   node cli.mjs profile resume.pdf
 *   node cli.mjs discover
 *   node cli.mjs digest [--mode preview|daily] [--mock] [--send]
 */

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '.');

const command = process.argv[2];
const args = process.argv.slice(3);

function runScript(scriptName, scriptArgs = []) {
  const scriptPath = resolve(ROOT, 'scripts', scriptName);
  if (!existsSync(scriptPath)) {
    console.error(`Script not found: ${scriptPath}`);
    process.exit(1);
  }

  const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
    stdio: 'inherit',
    cwd: ROOT,
  });

  child.on('error', (err) => {
    console.error(`Failed to start: ${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

function printHelp() {
  console.log(`
JobOps — AI Job Hunting Agent

Usage:
  node cli.mjs <command> [args...]

Setup Commands:
  profile <resume.pdf|.txt>       Generate profile.yml from resume (AI-powered)
  discover [--count N]            Discover target companies on Greenhouse/Lever/Ashby
  doctor                          Run health check

Search Commands:
  scan <query> [location]         Search job boards (use "auto" for profile-based)
  scan --mock                     Test with mock data
  digest [options]                Daily digest (scan + eval + outreach + email)
    --mode preview|daily          Preview mode (default) or daily with email
    --mock                        Use mock data
    --send                        Alias for --mode daily
    --max N                       Max jobs in digest (default: from config)
    --evaluate N                  Evaluate top N jobs with AI (default: 5)
    --query <q>                   Custom query (default: auto from profile)

Evaluation & Tailoring:
  evaluate <job-json>             Evaluate a job (5-dimension AI scoring)
  tailor <job-json>               Generate tailored CV + cover letter
  rank <query> [location]         Batch score all scraped jobs
  interview <company> [stage]     Generate interview prep pack
  upskill [--query <q>] [--limit N] Skill gap analysis + learning plan
  salary "<title>" [region]       Salary lookup from local data

Application Tracking:
  tracker list                    Show all applications
  tracker add <company> <role>    Add new application
  tracker update <company> <status> Update status
  tracker interview <company> <stage> [date] Add interview stage
  tracker outcome <company> <result> Record outcome
  tracker followup <company> <note> [date] Add follow-up
  tracker export                  Export tracker as CSV
  tracker report                  Generate HTML dashboard
  tracker attention               Show attention queue
  tracker review                  Outcome review + suggestions
  tracker autonomy                Show autonomy level
  tracker reset <mode>            Reset tracker (profile|documents|all)

Reports:
  report                          Generate HTML dashboard
  html-report                     Alias for report

Examples:
  # Setup
  node cli.mjs profile resume.pdf
  node cli.mjs discover
  
  # Daily workflow
  node cli.mjs digest --send
  node cli.mjs digest --mock --mode preview
  
  # Search & evaluate
  node cli.mjs scan "software engineer" "Remote"
  node cli.mjs scan auto
  node cli.mjs evaluate '{"title":"SWE","company":"Stripe","description":"..."}'
  node cli.mjs tailor '{"title":"SWE","company":"Stripe","description":"..."}'
  
  # Track applications
  node cli.mjs tracker add "Stripe" "Software Engineer"
  node cli.mjs tracker interview "Stripe" "Technical" "2025-01-15"
  node cli.mjs tracker outcome "Stripe" "Offer Received"
`);
}

switch (command) {
  case 'profile':
    runScript('profile-generator.mjs', args);
    break;
  case 'discover':
    runScript('discover-companies.mjs', args);
    break;
  case 'scan':
    runScript('scan.mjs', args);
    break;
  case 'evaluate':
    runScript('evaluate.mjs', args);
    break;
  case 'tailor':
    runScript('tailor.mjs', args);
    break;
  case 'tracker':
    runScript('tracker.mjs', args);
    break;
  case 'report':
  case 'html-report':
    runScript('html-report.mjs', args);
    break;
  case 'doctor':
    runScript('doctor.mjs', args);
    break;
  case 'rank':
    runScript('rank.mjs', args);
    break;
  case 'interview':
    runScript('interview.mjs', args);
    break;
  case 'upskill':
    runScript('upskill.mjs', args);
    break;
  case 'salary':
    runScript('salary.mjs', args);
    break;
  case 'digest':
    runScript('digest.mjs', args);
    break;
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}