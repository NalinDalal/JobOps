#!/usr/bin/env node

/**
 * reverseEngineer.mjs — Reverse-engineer job descriptions
 * Analyzes matched jobs to find patterns, common requirements,
 * and suggests AI integration angles for Wellfound outreach.
 *
 * Usage:
 *   node scripts/reverseEngineer.mjs                    — Analyze recent jobs
 *   node scripts/reverseEngineer.mjs --company "Stripe" — Research specific company
 *   node scripts/reverseEngineer.mjs --limit 20         — Analyze more jobs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { load as yamlLoad } from 'js-yaml';
import { loadActiveProfile, getProfileSkills, getProfileExperience, getProfileTargetRoles } from './lib/profile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Load env
const envPath = resolve(ROOT, '.env');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  }
}

const CF_TOKEN = process.env.CLOUDFLARE_API_KEY || process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_MODEL = process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const args = process.argv.slice(2);
function argVal(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx === args.length - 1) return fallback;
  return args[idx + 1];
}
const COMPANY = argVal('company', null);
const LIMIT = parseInt(argVal('limit', '15'), 10) || 15;

function runScan(query, location) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [resolve(ROOT, 'scripts/scan.mjs'), query, location], { cwd: ROOT });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || `scan.mjs exited ${code}`));
      const match = stdout.match(/\[[\s\S]*\]\s*$/);
      if (!match) return reject(new Error('Could not parse scan output'));
      resolvePromise(JSON.parse(match[0]));
    });
  });
}

async function cfAI(prompt) {
  if (!CF_TOKEN || !CF_ACCOUNT) {
    throw new Error('Cloudflare credentials not configured. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env');
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${CF_MODEL}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You are a job search strategist and AI integration consultant. Return markdown only.' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        max_tokens: 4096,
        temperature: 0.4,
      }),
    }
  );
  const data = await res.json();
  return data.result?.choices?.[0]?.message?.content || data.result?.response || '';
}

async function main() {
  const profile = loadActiveProfile();
  const mySkills = getProfileSkills(profile);
  const experience = getProfileExperience(profile);
  const targetRoles = getProfileTargetRoles(profile);

  let jobs = [];
  
  if (COMPANY) {
    // Research specific company
    console.log(`\n Researching ${COMPANY}...\n`);
    const queries = targetRoles.slice(0, 3);
    for (const q of queries) {
      try {
        const results = await runScan(q, 'any');
        jobs = jobs.concat(results.filter(j => j.company.toLowerCase().includes(COMPANY.toLowerCase())));
      } catch (e) {
        console.error(`Scan error: ${e.message}`);
      }
    }
  } else {
    // Analyze recent jobs
    console.log(`\n Reverse-engineering ${LIMIT} recent job descriptions...\n`);
    const queries = targetRoles.slice(0, 3);
    for (const q of queries) {
      try {
        const results = await runScan(q, 'any');
        jobs = jobs.concat(results);
      } catch (e) {
        console.error(`Scan error: ${e.message}`);
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  const unique = jobs.filter(j => {
    const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, LIMIT);

  if (unique.length === 0) {
    console.log('No jobs found to analyze.');
    return;
  }

  console.log(`Found ${unique.length} jobs to analyze:\n`);
  unique.forEach((j, i) => console.log(`  ${i + 1}. ${j.title} @ ${j.company} (${j.location})`));

  // Build analysis prompt
  const jobSummaries = unique.map((j, i) => 
    `[${i + 1}] ${j.title} at ${j.company}\n   Location: ${j.location}\n   Description: ${(j.snippet || '').substring(0, 200)}`
  ).join('\n\n');

  const prompt = `Analyze these ${unique.length} job postings and provide a reverse-engineering report.

MY PROFILE:
- Experience: ${experience}
- Skills: ${mySkills}
- Target roles: ${targetRoles.join(', ')}

JOB POSTINGS:
${jobSummaries}

Provide a markdown report with:

## 1. Skill Patterns
What skills/tech appear most frequently? What's the "hidden curriculum" (unstated requirements)?

## 2. Company Patterns  
What types of companies are hiring? (Stage, industry, size)

## 3. Role Patterns
What are the common responsibilities? What projects would I likely work on?

## 4. Gap Analysis
What's the #1 skill gap I should close? Specific resources to learn it.

## 5. AI Integration Angles (for Wellfound outreach)
For each unique company, suggest ONE specific AI/automation use case they could implement.
Format: "Company: [use case idea] — why it fits them"

## 6. Actionable Next Steps
- Top 3 things to learn this week
- Top 3 companies to research deeper
- Specific project ideas that would impress these employers`;

  console.log('\n Generating reverse-engineering report...\n');

  const report = await cfAI(prompt);
  console.log(report);

  // Save report
  const reportsDir = resolve(ROOT, 'reports');
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  const date = new Date().toISOString().split('T')[0];
  const reportFile = resolve(reportsDir, `reverse-engineer-${date}.md`);
  writeFileSync(reportFile, `# Reverse-Engineering Report — ${date}\n\n${report}\n`);
  console.log(`\n Report saved to: ${reportFile}`);
}

main().catch(e => {
  console.error(`Reverse-engineer failed: ${e.message}`);
  process.exit(1);
});
