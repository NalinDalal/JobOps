#!/usr/bin/env node

/**
 * loomOutreach.mjs — Wellfound company research + loom outreach flow
 * Finds companies, identifies AI use cases, drafts personalized outreach.
 *
 * Usage:
 *   node scripts/loomOutreach.mjs                      — Find 5 companies to target
 *   node scripts/loomOutreach.mjs --company "Razorpay" — Deep research on one company
 *   node scripts/loomOutreach.mjs --count 10           — Find more companies
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadActiveProfile, getProfileSkills, getProfileExperience, getProfileCandidate } from './lib/profile.mjs';

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
const COUNT = parseInt(argVal('count', '5'), 10) || 5;

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
          { role: 'system', content: 'You are a startup outreach specialist. Return markdown only.' },
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
  const candidate = getProfileCandidate(profile);
  const mySkills = getProfileSkills(profile);
  const experience = getProfileExperience(profile);

  if (COMPANY) {
    // Deep research on one company
    console.log(`\n Deep research: ${COMPANY}\n`);
    
    const prompt = `Research the company "${COMPANY}" and create a personalized outreach strategy.

MY PROFILE:
- Name: ${candidate.name}
- Skills: ${mySkills}
- Experience: ${experience}
- GitHub: ${candidate.github || 'N/A'}
- Portfolio: ${candidate.portfolio || 'N/A'}

Provide:

## Company Research
- What does ${COMPANY} do? (1-2 sentences)
- Tech stack they likely use
- Recent news or launches
- Team size and stage

## AI Integration Angle
- ONE specific AI/automation use case for ${COMPANY}
- Why this fits their business
- Quick prototype I could build in 1-2 days
- Expected impact

## Loom Script (60 seconds)
Write a script for a Loom video:
1. Hook (5s): "Hey [Name], I noticed ${COMPANY} does X..."
2. Problem (15s): "I saw you're dealing with Y..."
3. Solution (20s): "I built a quick prototype that..."
4. CTA (10s): "Would love to show you how it works..."

## Email/DM Template
Write a short, personalized DM (under 100 words) that references the loom.

## Who to Contact
- Suggest 2-3 roles to reach out to (CTO, Engineering Manager, etc.)
- LinkedIn search strings to find them`;

    console.log('Generating research...\n');
    const report = await cfAI(prompt);
    console.log(report);

    // Save
    const reportsDir = resolve(ROOT, 'reports');
    if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
    const date = new Date().toISOString().split('T')[0];
    const slug = COMPANY.toLowerCase().replace(/\s+/g, '-');
    const reportFile = resolve(reportsDir, `loom-${slug}-${date}.md`);
    writeFileSync(reportFile, `# Loom Outreach: ${COMPANY} — ${date}\n\n${report}\n`);
    console.log(`\n Saved to: ${reportFile}`);

  } else {
    // Find companies to target
    console.log(`\n Finding ${COUNT} companies for loom outreach...\n`);

    const prompt = `Find ${COUNT} startups/companies that would benefit from AI integration.

MY PROFILE:
- Skills: ${mySkills}
- Experience: ${experience}

For each company, provide:
1. Company name
2. What they do (1 sentence)
3. AI use case I could build for them (specific, not generic)
4. Why they'd care (business impact)
5. Difficulty (Easy/Medium/Hard)
6. Who to contact (role title)

Focus on:
- Companies with public products I can try
- Real problems I can solve with AI/automation
- Mix of easy wins and impressive projects
- Companies hiring for roles matching my profile

Format as a numbered list with clear sections.`;

    console.log('Finding companies...\n');
    const report = await cfAI(prompt);
    console.log(report);

    // Save
    const reportsDir = resolve(ROOT, 'reports');
    if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
    const date = new Date().toISOString().split('T')[0];
    const reportFile = resolve(reportsDir, `loom-targets-${date}.md`);
    writeFileSync(reportFile, `# Loom Outreach Targets — ${date}\n\n${report}\n`);
    console.log(`\n Saved to: ${reportFile}`);
  }
}

main().catch(e => {
  console.error(`Loom outreach failed: ${e.message}`);
  process.exit(1);
});
