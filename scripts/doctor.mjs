#!/usr/bin/env node

/**
 * doctor.mjs — System health check
 * Validates all prerequisites are met.
 * 
 * Usage: node scripts/doctor.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let healthy = true;
const issues = [];

function check(name, condition, fix) {
  if (condition) {
    console.log(`  ✅ ${name}`);
  } else {
    console.log(`  ❌ ${name}`);
    issues.push({ name, fix });
    healthy = false;
  }
}

console.log('\n🔍 JobOps Health Check\n');

// 1. Node.js
check('Node.js installed', typeof process.version === 'string', 'Install Node.js from nodejs.org');

// 2. .env file
const envPath = resolve(ROOT, '.env');
check('.env file exists', existsSync(envPath), 'Copy .env.example to .env and fill in your keys');

// 3. Cloudflare credentials
let activeModel = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
if (existsSync(envPath)) {
  const env = readFileSync(envPath, 'utf-8');
  const hasKey = env.includes('CLOUDFLARE_API_KEY=') && !env.includes('CLOUDFLARE_API_KEY=your_');
  const hasAccount = env.includes('CLOUDFLARE_ACCOUNT_ID=') && !env.includes('CLOUDFLARE_ACCOUNT_ID=your_');
  check('Cloudflare API key set', hasKey, 'Set CLOUDFLARE_API_KEY in .env');
  check('Cloudflare account ID set', hasAccount, 'Set CLOUDFLARE_ACCOUNT_ID in .env');

  // Report the model that is actually active on every run
  const modelMatch = env.match(/^CLOUDFLARE_MODEL=(.*)$/m);
  if (modelMatch && modelMatch[1].trim() && !modelMatch[1].includes('your_')) {
    activeModel = modelMatch[1].trim();
  }
}
console.log(`\n  Active Cloudflare model: ${activeModel}`);

// 4. Profile
const profilePath = resolve(ROOT, 'config/profile.yml');
check('Profile configured', existsSync(profilePath), 'Run: cp config/profile.example.yml config/profile.yml');

// 5. CV
const cvPath = resolve(ROOT, 'config/cv.md');
check('CV exists', existsSync(cvPath), 'Create config/cv.md with your CV in markdown');

// 6. Data directory
const dataPath = resolve(ROOT, 'data');
check('Data directory exists', existsSync(dataPath), 'Run: mkdir data');

// 7. Scripts
const scriptsPath = resolve(ROOT, 'scripts');
check('Scripts directory exists', existsSync(scriptsPath), 'Run: mkdir scripts');

console.log('\n' + '─'.repeat(50));

if (healthy) {
  console.log('\n✅ All checks passed! Ready to hunt jobs.\n');
  console.log('Try: node scripts/scan.mjs "software engineer" "Remote"');
} else {
  console.log(`\n⚠️  ${issues.length} issue(s) found:\n`);
  for (const issue of issues) {
    console.log(`  • ${issue.name}: ${issue.fix}`);
  }
  console.log('');
}
