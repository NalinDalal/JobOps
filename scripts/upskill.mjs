#!/usr/bin/env node

/**
 * upskill.mjs — Skill gap analysis and learning plan generator
 *
 * Usage: node scripts/upskill.mjs [--query "software engineer"] [--limit 10]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { load as yamlLoad } from 'js-yaml';
import { loadActiveProfile, getProfileSkills, getProfileTargetRoles, getProfileTargetLocations, getProfileExperience } from './lib/profile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
function argVal(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx === args.length - 1) return fallback;
  return args[idx + 1];
}
const QUERY = argVal('query', 'auto');
const LIMIT = parseInt(argVal('limit', '20'), 10) || 20;

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

function extractKeywords(text) {
  const tokens = new Set();
  const lower = text.toLowerCase();
  const common = new Set(['the','and','for','with','using','from','that','this','have','has','had','will','would','could','should','may','might','must','can','shall','not','are','was','were','been','being','have','has','had','does','did','doing','a','an','the','and','but','or','nor','for','yet','so','in','on','at','to','from','by','about','as','into','through','during','before','after','above','below','between','out','off','over','under','again','further','then','once','here','there','when','where','why','how','all','both','each','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','s','t','just','don','now','also','work','working','worked','role','job','team','experience','years','year','looking','looking','strong','proficient','knowledge','understanding','etc','including','including','plus','preferred','required','skills','skill']);
  for (const m of lower.matchAll(/[a-z][a-z0-9+#.-]{1,}/g)) {
    const t = m[0].replace(/^[#.\-+]+|[#.\-+]+$/g, '');
    if (t.length >= 3 && !common.has(t)) tokens.add(t);
  }
  return tokens;
}

async function main() {
  const profile = loadActiveProfile();
  const queries = QUERY.toLowerCase() === 'auto'
    ? getProfileTargetRoles(profile)
    : [QUERY];

  const mySkills = new Set(extractKeywords(getProfileSkills(profile)));
  console.log(`Your skills: ${[...mySkills].slice(0, 20).join(', ')}...`);

  let all = [];
  for (const q of queries) {
    const results = await runScan(q, 'any');
    all = all.concat(results);
  }

  // Deduplicate
  const seen = new Set();
  const unique = all.filter(j => {
    const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const jobs = unique.slice(0, LIMIT);
  const jobKeywords = jobs.map(j => ({ job: j, keywords: extractKeywords(j.snippet || j.title) }));

  // Count demand across jobs
  const demand = new Map();
  for (const { keywords } of jobKeywords) {
    for (const kw of keywords) {
      demand.set(kw, (demand.get(kw) || 0) + 1);
    }
  }

  // Gaps = demanded but not in my skills
  const gaps = [...demand.entries()]
    .filter(([kw]) => !mySkills.has(kw))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  console.log(`\nAnalyzed ${jobs.length} jobs. Top skill gaps:\n`);
  for (const [skill, count] of gaps) {
    console.log(`- ${skill} (mentioned in ${count} job${count > 1 ? 's' : ''})`);
  }

  if (gaps.length === 0) {
    console.log('No obvious skill gaps found based on scraped job snippets.');
    return;
  }

  const gapList = gaps.map(([skill]) => skill).join(', ');

  const CF_TOKEN = process.env.CLOUDFLARE_API_KEY || process.env.CLOUDFLARE_API_TOKEN;
  const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_MODEL = process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

  const prompt = `I am a ${getProfileExperience(profile)} engineer with skills in ${getProfileSkills(profile)}.
I analyzed ${jobs.length} job postings and found these skill gaps (skills employers want but I don't have yet):
${gapList}

Create a prioritized learning plan in markdown with:
1. A heatmap table: Skill | Demand (out of ${jobs.length} jobs) | Priority | Estimated Time
2. For each gap, suggest ONE specific, high-quality free or low-cost resource (course, docs, project idea)
3. Order by priority (highest demand first)

Keep it concise and actionable. Do not invent fake course URLs.`;

  console.log('\nGenerating learning plan...\n');

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
          { role: 'system', content: 'You are a career coach. Return markdown only.' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        max_tokens: 2048,
        temperature: 0.4,
      }),
    }
  );

  const data = await res.json();
  const content = data.result?.choices?.[0]?.message?.content || data.result?.response || 'Could not generate plan.';
  console.log(content);
}

main().catch(e => {
  console.error(`Upskill failed: ${e.message}`);
  process.exit(1);
});
