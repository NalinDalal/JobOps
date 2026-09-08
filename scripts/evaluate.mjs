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
import { load as yamlLoad } from 'js-yaml';
import {
  loadActiveProfile,
  getProfileSkills,
  getProfileTargetRoles,
  getProfileTargetLocations,
  getProfileExperience,
  getProfilePreferences,
} from './lib/profile.mjs';
import { loadEnv } from './lib/env.mjs';
import { cfAI, parseJSON } from './lib/ai.mjs';
import { SCORE_STRONG, SCORE_REVIEW, CV_TRUNCATE } from './lib/constants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

loadEnv(ROOT);

function loadProfile() {
  const profile = loadActiveProfile();
  const data = profile.data;
  const skills = data.skills || {};
  const cat = (...keys) => keys.flatMap((k) => skills[k] || []).filter(Boolean);
  const join = (arr) => arr.map(String).join(', ');
  return {
    skills: join(cat('languages', 'frameworks', 'databases', 'devops', 'tools')),
    targetRoles: join(data.target_roles || []),
    targetLocations: join(data.target_locations || []),
    salary: data.preferences?.salary_range || 'Negotiable',
    experience: getProfileExperience(profile),
  };
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error(
      'Usage: node scripts/evaluate.mjs \'{"title":"...","company":"...","description":"..."}\'',
    );
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
Description: ${(job.description || job.snippet || '').substring(0, CV_TRUNCATE)}

IMPORTANT: This candidate is Junior/Entry-level (0-2 years). Jobs requiring 5+ years of experience are a poor fit.

Rate 1-5 for each dimension:
- roleFit: How well does the role match skills and target roles?
- locationFit: Is the location compatible with preferences?
- growthPotential: Does this role offer career growth?
- compFit: Is the compensation likely competitive for the role?
- cultureFit: Does the company culture seem aligned (consider work-life balance, tech stack, mission)?

Also provide:
- entryLevelFit: Is this role suitable for someone with 0-2 years experience? (1=requires 5+ years, 5=open to fresh graduates)
- recommendation: One-line recommendation
- analysis: 2-3 sentences of detailed analysis
- redFlags: Array of potential concerns (empty array if none)

Return JSON: {"overall":4.2,"roleFit":4.5,"locationFit":4.0,"growthPotential":4.5,"compFit":4.0,"cultureFit":4.0,"entryLevelFit":4.0,"recommendation":"Apply!","analysis":"...","redFlags":[]}`;

  console.log(`Evaluating: ${job.title} at ${job.company}...`);
  const raw = await cfAI(prompt);
  const result = parseJSON(raw, {
    overall: 3.0,
    roleFit: 3.0,
    locationFit: 3.0,
    growthPotential: 3.0,
    compFit: 3.0,
    cultureFit: 3.0,
    entryLevelFit: 3.0,
    recommendation: 'Manual review needed',
    analysis: 'Could not parse AI evaluation.',
    redFlags: [],
  });

  // Validate redFlags is array
  if (!Array.isArray(result.redFlags)) result.redFlags = [];

  // Factor in entry-level fit: penalize if role requires too much experience
  if (result.entryLevelFit && result.entryLevelFit < 3) {
    const penalty = (3 - result.entryLevelFit) * 0.3;
    result.overall = Math.max(1, result.overall - penalty);
    result.redFlags.push(
      `Requires more experience than candidate has (entry-level fit: ${result.entryLevelFit}/5)`,
    );
  }

  // Calculate overall if not provided
  if (!result.overall || result.overall === 3.0) {
    const scores = [
      result.roleFit,
      result.locationFit,
      result.growthPotential,
      result.compFit,
      result.cultureFit,
    ];
    if (result.entryLevelFit) scores.push(result.entryLevelFit);
    result.overall = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  // Determine recommendation based on score
  let verdict = 'Skip';
  if (result.overall >= SCORE_STRONG) verdict = 'Strong Apply';
  else if (result.overall >= SCORE_REVIEW) verdict = 'Review';
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
  console.log(`| Entry-Level Fit | ${result.entryLevelFit || 'N/A'}/5 |`);
  console.log(`\n### Analysis\n${result.analysis}`);
  console.log(`\n### Recommendation\n${result.recommendation}`);

  if (result.redFlags.length > 0) {
    console.log(`\n### Red Flags\n${result.redFlags.map((f) => `- ${f}`).join('\n')}`);
  }

  // Save report
  const reportsDir = resolve(ROOT, 'reports');
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  const reportFile = resolve(
    reportsDir,
    `${job.company.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.md`,
  );

  const reportContent = `# Evaluation: ${job.title} at ${job.company}

## Scores
- **Overall**: ${result.overall.toFixed(1)}/5
- Role Fit: ${result.roleFit}/5
- Location: ${result.locationFit}/5
- Growth: ${result.growthPotential}/5
- Compensation: ${result.compFit}/5
- Culture: ${result.cultureFit}/5
- Entry-Level Fit: ${result.entryLevelFit || 'N/A'}/5

## Analysis
${result.analysis}

## Recommendation
${result.recommendation}

## Red Flags
${result.redFlags.length > 0 ? result.redFlags.map((f) => `- ${f}`).join('\n') : 'None identified'}

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
