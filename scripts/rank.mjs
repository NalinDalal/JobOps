#!/usr/bin/env node

/**
 * rank.mjs — Batch score all scraped jobs and return a ranked shortlist.
 *
 * Usage: node scripts/rank.mjs "software engineer" "Remote" [--limit 20] [--min-score 3.5]
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
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
const QUERY = args[0] || 'auto';
const LOCATION = args[1] || 'Remote';
const LIMIT = parseInt(argVal('limit', '50'), 10) || 50;
const MIN_SCORE = parseFloat(argVal('min-score', '0')) || 0;

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

function evaluateJob(job) {
  return new Promise(resolvePromise => {
    const payload = JSON.stringify({
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.snippet || '',
    });
    const child = spawn(process.execPath, [resolve(ROOT, 'scripts/evaluate.mjs'), payload], { cwd: ROOT });
    let stdout = '';
    child.stdout.on('data', d => (stdout += d));
    child.on('error', () => resolvePromise(null));
    child.on('close', code => {
      if (code !== 0) return resolvePromise(null);
      const marker = stdout.lastIndexOf('---EVAL_JSON---');
      if (marker === -1) return resolvePromise(null);
      try {
        const evalJson = stdout.slice(marker + '---EVAL_JSON---'.length).trim();
        const firstLine = evalJson.split('\n')[0];
        resolvePromise(JSON.parse(firstLine));
      } catch {
        resolvePromise(null);
      }
    });
  });
}

async function main() {
  const profile = loadActiveProfile();
  const queries = QUERY.toLowerCase() === 'auto'
    ? getProfileTargetRoles(profile)
    : [QUERY];

  console.log(`Ranking jobs for: ${queries.join(', ')} in ${LOCATION}`);

  let all = [];
  for (const q of queries) {
    const results = await runScan(q, LOCATION);
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

  console.log(`Scanned ${unique.length} unique jobs. Evaluating...`);

  const evaluated = [];
  for (const job of unique) {
    const result = await evaluateJob(job);
    if (result) {
      job.evaluation = result;
      evaluated.push(job);
    }
  }

  evaluated.sort((a, b) => (b.evaluation.overall || 0) - (a.evaluation.overall || 0));

  const filtered = MIN_SCORE > 0 ? evaluated.filter(j => (j.evaluation.overall || 0) >= MIN_SCORE) : evaluated;
  const sliced = filtered.slice(0, LIMIT);

  console.log(`\nRanked ${sliced.length} jobs:\n`);
  console.log(JSON.stringify(sliced, null, 2));
}

main().catch(e => {
  console.error(`Rank failed: ${e.message}`);
  process.exit(1);
});
