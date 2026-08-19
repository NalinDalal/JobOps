#!/usr/bin/env node

/**
 * salary.mjs — Salary lookup from local data files
 *
 * Usage: node scripts/salary.mjs "Software Engineer" ["India"]
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SALARY_DIR = resolve(ROOT, 'data/salary');

const args = process.argv.slice(2);
const TITLE = (args[0] || '').toLowerCase();
const REGION = (args[1] || '').toLowerCase();

if (!TITLE) {
  console.error('Usage: node scripts/salary.mjs "Software Engineer" ["India"]');
  process.exit(1);
}

function loadSalaryFiles() {
  if (!existsSync(SALARY_DIR)) return [];
  return readdirSync(SALARY_DIR).filter(f => f.endsWith('.json'));
}

function matchRole(role, title) {
  const r = role.title.toLowerCase();
  return r.includes(title) || title.includes(r);
}

function main() {
  const files = loadSalaryFiles();
  let best = null;

  for (const file of files) {
    try {
      const raw = readFileSync(resolve(SALARY_DIR, file), 'utf-8');
      const data = JSON.parse(raw);
      const region = (data.region || '').toLowerCase();

      // Skip if region specified and doesn't match
      if (REGION && !region.includes(REGION) && !REGION.includes(region)) continue;

      for (const role of data.roles || []) {
        if (matchRole(role, TITLE)) {
          if (!best || (role.median || 0) > (best.median || 0)) {
            best = { ...role, region: data.region, file };
          }
        }
      }
    } catch {}
  }

  if (!best) {
    console.log(`No salary data found for "${TITLE}"${REGION ? ` in "${REGION}"` : ''}.`);
    console.log('Add data to data/salary/*.json following the schema in docs/customization.md.');
    return;
  }

  console.log(JSON.stringify({
    title: best.title,
    region: best.region,
    currency: best.currency,
    min: best.min,
    max: best.max,
    median: best.median,
    source: best.source,
  }, null, 2));
}

main();
