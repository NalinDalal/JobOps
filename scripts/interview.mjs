#!/usr/bin/env node

/**
 * interview.mjs — Interview prep pack generator
 *
 * Usage: node scripts/interview.mjs "Company" ["stage"]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load as yamlLoad } from 'js-yaml';
import { loadActiveProfile, getProfileCandidate, getProfileSkills, getProfileExperience } from './lib/profile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TRACKER_PATH = resolve(ROOT, 'data/applications.md');

const args = process.argv.slice(2);
const COMPANY = args[0];
const STAGE = args[1] || 'Technical';

if (!COMPANY) {
  console.error('Usage: node scripts/interview.mjs "Company" ["stage"]');
  process.exit(1);
}

function readTracker() {
  if (!existsSync(TRACKER_PATH)) return [];
  const content = readFileSync(TRACKER_PATH, 'utf-8');
  const rows = [];
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.startsWith('|') && !line.startsWith('| #') && !line.startsWith('|---')) {
      const cols = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 4) {
        rows.push({
          company: cols[1],
          role: cols[2],
          status: cols[3],
          score: cols[5] || '—',
          interviewStage: cols[7] || '—',
          outcome: cols[8] || '—',
        });
      }
    }
  }
  return rows;
}

function findTrackerEntry(company) {
  const rows = readTracker();
  return rows.find(r => r.company.toLowerCase() === company.toLowerCase()) || null;
}

async function main() {
  const entry = findTrackerEntry(COMPANY);
  if (!entry) {
    console.error(`Company "${COMPANY}" not found in tracker. Add it first with: node scripts/tracker.mjs add "${COMPANY}" "Role"`);
    process.exit(1);
  }

  const profile = loadActiveProfile();
  const candidate = getProfileCandidate(profile);
  const skills = getProfileSkills(profile);
  const experience = getProfileExperience(profile);

  const cvPath = resolve(ROOT, 'config/cv.md');
  const baseCv = existsSync(cvPath) ? readFileSync(cvPath, 'utf-8') : '';

  const prompt = `Generate an interview prep pack for the following:

CANDIDATE: ${candidate.name || 'Candidate'}
EXPERIENCE: ${experience}
SKILLS: ${skills}

APPLICATION:
Company: ${COMPANY}
Role: ${entry.role}
Status: ${entry.status}
Score: ${entry.score}
Current Interview Stage: ${STAGE}

BASE CV (excerpt):
${baseCv.substring(0, 3000)}

Generate a stage-specific prep pack in markdown with these sections:
1. Company Overview — 2-3 sentences on what they do and their market position
2. Likely Questions — 5 questions specific to this role and stage (Technical, System Design, Behavioral, etc.)
3. STAR-Mapped Answers — map 3 of your likely questions to STAR format using only real experience from your CV
4. Questions to Ask Them — 4 thoughtful questions about the team, tech stack, and growth

Do not invent experience. If a STAR answer requires a metric you don't have, state the action without inventing a number.`;

  console.log(`Preparing interview pack for ${COMPANY} — ${STAGE}...`);

  const CF_TOKEN = process.env.CLOUDFLARE_API_KEY || process.env.CLOUDFLARE_API_TOKEN;
  const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_MODEL = process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

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
          { role: 'system', content: 'You are an interview coach. Return markdown only.' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        max_tokens: 2048,
        temperature: 0.4,
      }),
    }
  );

  const data = await res.json();
  const content = data.result?.choices?.[0]?.message?.content || data.result?.response || 'Could not generate prep pack.';

  console.log(`\n# Interview Prep: ${COMPANY} — ${STAGE}\n`);
  console.log(content);
}

main().catch(e => {
  console.error(`Interview prep failed: ${e.message}`);
  process.exit(1);
});
