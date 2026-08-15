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
const CF_MODEL = process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

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

function loadProfile() {
  const profilePath = resolve(ROOT, 'config/profile.yml');
  let profile = {
    skills: '',
    targetRoles: '',
    targetLocations: 'Remote, India',
    salary: '',
    experience: '',
  };

  if (existsSync(profilePath)) {
    const content = readFileSync(profilePath, 'utf-8');

    const skillsMatch = content.match(/skills:[\s\S]*?(?=\n\w|\n$)/);
    const rolesMatch = content.match(/target_roles:[\s\S]*?(?=\n\w|\n$)/);
    const locMatch = content.match(/target_locations:[\s\S]*?(?=\n\w|\n$)/);
    const salaryMatch = content.match(/salary_range:[\s\S]*?(?=\n\w|\n$)/);
    const expMatch = content.match(/experience:[\s\S]*?(?=\n\w|\n$)/);

    if (skillsMatch) profile.skills = skillsMatch[0].replace(/skills:\s*\n?\s*-\s*/g, '').replace(/\n/g, ', ');
    if (rolesMatch) profile.targetRoles = rolesMatch[0].replace(/target_roles:\s*\n?\s*-\s*/g, '').replace(/\n/g, ', ');
    if (locMatch) profile.targetLocations = locMatch[0].replace(/target_locations:\s*\n?\s*-\s*/g, '').replace(/\n/g, ', ');
    if (salaryMatch) profile.salary = salaryMatch[0].replace(/salary_range:\s*/, '').trim();
    if (expMatch) profile.experience = expMatch[0].replace(/experience:\s*\n?\s*-\s*/g, '').replace(/\n/g, ', ');
  }

  return profile;
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node scripts/evaluate.mjs \'{"title":"...","company":"...","description":"..."}\'');
    process.exit(1);
  }

  const job = JSON.parse(input);
  const profile = loadProfile();

  const prompt = `Evaluate this job for the candidate. Return ONLY a JSON object.

CANDIDATE:
Skills: ${profile.skills}
Target Roles: ${profile.targetRoles}
Preferred Locations: ${profile.targetLocations}
Experience: ${profile.experience}
Salary Expectation: ${profile.salary || 'Negotiable'}

JOB:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}
Description: ${(job.description || job.snippet || '').substring(0, 3000)}

Rate 1-5 for each dimension:
- roleFit: How well does the role match skills and target roles?
- locationFit: Is the location compatible with preferences?
- growthPotential: Does this role offer career growth?
- compFit: Is the compensation likely competitive for the role?
- cultureFit: Does the company culture seem aligned (consider work-life balance, tech stack, mission)?

Also provide:
- recommendation: One-line recommendation
- analysis: 2-3 sentences of detailed analysis
- redFlags: Array of potential concerns (empty array if none)

Return JSON: {"overall":4.2,"roleFit":4.5,"locationFit":4.0,"growthPotential":4.5,"compFit":4.0,"cultureFit":4.0,"recommendation":"Apply!","analysis":"...","redFlags":[]}`;

  console.log(`Evaluating: ${job.title} at ${job.company}...`);
  const raw = await cfAI(prompt);
  const result = parseJSON(raw, {
    overall: 3.0,
    roleFit: 3.0,
    locationFit: 3.0,
    growthPotential: 3.0,
    compFit: 3.0,
    cultureFit: 3.0,
    recommendation: 'Manual review needed',
    analysis: 'Could not parse AI evaluation.',
    redFlags: [],
  });

  // Validate redFlags is array
  if (!Array.isArray(result.redFlags)) result.redFlags = [];

  // Calculate overall if not provided
  if (!result.overall) {
    const scores = [result.roleFit, result.locationFit, result.growthPotential, result.compFit, result.cultureFit];
    result.overall = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  // Determine recommendation based on score
  let verdict = 'Skip';
  if (result.overall >= 4.0) verdict = 'Strong Apply';
  else if (result.overall >= 3.5) verdict = 'Review';
  else if (result.overall >= 3.0) verdict = 'Maybe';

  // Format output
  console.log(`\n## Evaluation: ${job.title} at ${job.company}\n`);
  console.log(`**Overall Score: ${result.overall.toFixed(1)}/5.0** → ${verdict}`);
  console.log(`\n### Dimension Scores`);
  console.log(`| Dimension | Score |`);
  console.log(`|-----------|-------|`);
  console.log(`| Role Fit | ${result.roleFit}/5 |`);
  console.log(`| Location | ${result.locationFit}/5 |`);
  console.log(`| Growth | ${result.growthPotential}/5 |`);
  console.log(`| Compensation | ${result.compFit}/5 |`);
  console.log(`| Culture | ${result.cultureFit}/5 |`);
  console.log(`\n### Analysis\n${result.analysis}`);
  console.log(`\n### Recommendation\n${result.recommendation}`);

  if (result.redFlags.length > 0) {
    console.log(`\n### Red Flags\n${result.redFlags.map(f => `- ${f}`).join('\n')}`);
  }

  // Save report
  const reportsDir = resolve(ROOT, 'reports');
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  const reportFile = resolve(reportsDir, `${job.company.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.md`);

  const reportContent = `# Evaluation: ${job.title} at ${job.company}

## Scores
- **Overall**: ${result.overall.toFixed(1)}/5
- Role Fit: ${result.roleFit}/5
- Location: ${result.locationFit}/5
- Growth: ${result.growthPotential}/5
- Compensation: ${result.compFit}/5
- Culture: ${result.cultureFit}/5

## Analysis
${result.analysis}

## Recommendation
${result.recommendation}

## Red Flags
${result.redFlags.length > 0 ? result.redFlags.map(f => `- ${f}`).join('\n') : 'None identified'}

## Raw Data
\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\`
`;

  writeFileSync(reportFile, reportContent);
  console.log(`\nReport saved to: ${reportFile}`);

  // Output JSON for downstream scripts
  console.log(`\n---EVAL_JSON---`);
  console.log(JSON.stringify(result));
}

main();
