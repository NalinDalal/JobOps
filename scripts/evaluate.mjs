#!/usr/bin/env node

/**
 * evaluate.mjs — Job evaluation tool
 * Uses Cloudflare Workers AI to score a job against user profile.
 * 
 * Usage: node scripts/evaluate.mjs '{"title":"SWE","company":"Stripe","description":"..."}'
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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
const CF_MODEL = process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.1-8b-instruct';

async function cfAI(prompt) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${CF_MODEL}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You are a job evaluation assistant. Return raw JSON, no markdown.' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        max_tokens: 2048,
        temperature: 0.3,
      }),
    }
  );
  const data = await res.json();
  // Cloudflare returns in result.choices[0].message.content or result.response
  return data.result?.choices?.[0]?.message?.content || data.result?.response || '';
}

function parseJSON(raw, fallback) {
  try {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) return JSON.parse(match[1]);
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node scripts/evaluate.mjs \'{"title":"...","company":"...","description":"..."}\'');
    process.exit(1);
  }

  const job = JSON.parse(input);
  
  // Load profile
  const profilePath = resolve(ROOT, 'config/profile.yml');
  let profile = { skills: '', targetRoles: '', targetLocations: 'Remote, India' };
  if (existsSync(profilePath)) {
    // Simple YAML parser for profile
    const content = readFileSync(profilePath, 'utf-8');
    const skillsMatch = content.match(/skills:[\s\S]*?(?=\n\w|\n$)/);
    const rolesMatch = content.match(/target_roles:[\s\S]*?(?=\n\w|\n$)/);
    const locMatch = content.match(/target_locations:[\s\S]*?(?=\n\w|\n$)/);
    if (skillsMatch) profile.skills = skillsMatch[0].replace(/skills:\s*\n?\s*-\s*/g, '').replace(/\n/g, ', ');
    if (rolesMatch) profile.targetRoles = rolesMatch[0].replace(/target_roles:\s*\n?\s*-\s*/g, '').replace(/\n/g, ', ');
    if (locMatch) profile.targetLocations = locMatch[0].replace(/target_locations:\s*\n?\s*-\s*/g, '').replace(/\n/g, ', ');
  }

  const prompt = `Evaluate this job for the candidate. Return ONLY a JSON object.

CANDIDATE:
Skills: ${profile.skills}
Target Roles: ${profile.targetRoles}
Preferred Locations: ${profile.targetLocations}

JOB:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}
Description: ${(job.description || job.snippet || '').substring(0, 2000)}

Rate 1-5 for: overall, roleFit, locationFit, growthPotential.
Add "recommendation" (one line) and "analysis" (2-3 sentences).

Return JSON: {"overall":4.2,"roleFit":4.5,"locationFit":4.0,"growthPotential":4.5,"recommendation":"Apply!","analysis":"..."}`;

  console.log(`Evaluating: ${job.title} at ${job.company}...`);
  const raw = await cfAI(prompt);
  const result = parseJSON(raw, {
    overall: 3.0, roleFit: 3.0, locationFit: 3.0, growthPotential: 3.0,
    recommendation: 'Manual review needed',
    analysis: 'Could not parse AI evaluation.',
  });

  // Format output
  console.log(`\n## Evaluation: ${job.title} at ${job.company}\n`);
  console.log(`**Overall Score: ${result.overall}/5.0** → ${result.overall >= 4.0 ? 'Apply' : result.overall >= 3.5 ? 'Review' : 'Skip'}`);
  console.log(`\n### Dimension Scores`);
  console.log(`| Dimension | Score |`);
  console.log(`|-----------|-------|`);
  console.log(`| Role Fit | ${result.roleFit}/5 |`);
  console.log(`| Location | ${result.locationFit}/5 |`);
  console.log(`| Growth | ${result.growthPotential}/5 |`);
  console.log(`\n### Analysis\n${result.analysis}`);
  console.log(`\n### Recommendation\n${result.recommendation}`);

  // Save report
  const reportsDir = resolve(ROOT, 'reports');
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  const reportFile = resolve(reportsDir, `${job.company.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.md`);
  writeFileSync(reportFile, `# Evaluation: ${job.title} at ${job.company}\n\n${JSON.stringify(result, null, 2)}`);
  console.log(`\nReport saved to: ${reportFile}`);
}

main();
