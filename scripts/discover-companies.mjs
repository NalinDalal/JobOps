#!/usr/bin/env node

/**
 * discover-companies.mjs — AI-powered company discovery
 * Finds 15 target companies on Greenhouse/Lever/Ashby based on profile
 * 
 * Usage:
 *   node scripts/discover-companies.mjs
 *   node scripts/discover-companies.mjs --count 20
 * 
 * Output: Prints YAML block to copy into config/portals.yml
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import { loadActiveProfile, getProfileCandidate, getProfileSkills, getProfileTargetRoles, getProfileExperience } from './lib/profile.mjs';

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
  if (!CF_TOKEN || !CF_ACCOUNT) {
    throw new Error('Cloudflare credentials not configured. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env');
  }
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
          { role: 'system', content: 'You are a job search strategist. Find companies hiring on Greenhouse/Lever/Ashby. Return ONLY valid YAML.' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        max_tokens: 4096,
        temperature: 0.3,
      }),
    }
  );
  const data = await res.json();
  return data.result?.choices?.[0]?.message?.content || data.result?.response || '';
}

function loadProfileSummary() {
  const profile = loadActiveProfile();
  const candidate = getProfileCandidate(profile);
  const skills = getProfileSkills(profile);
  const targetRoles = getProfileTargetRoles(profile);
  const experience = getProfileExperience(profile);
  
  return {
    name: candidate.name,
    skills,
    targetRoles,
    experience,
    location: candidate.location,
  };
}

function parseCompaniesYAML(text) {
  try {
    const cleaned = text
      .replace(/```ya?ml\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    return yamlLoad(cleaned);
  } catch (e) {
    console.error('Failed to parse AI response as YAML:', e.message);
    console.error('Raw response:', text.substring(0, 500));
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const count = args.includes('--count') ? parseInt(args[args.indexOf('--count') + 1], 10) || 15 : 15;
  
  const profile = loadProfileSummary();
  
  console.log('🔍 Discovering target companies based on your profile...');
  console.log(`   Target roles: ${profile.targetRoles.join(', ')}`);
  console.log(`   Skills: ${profile.skills.substring(0, 100)}...`);
  console.log(`   Experience: ${profile.experience}`);
  console.log(`   Location: ${profile.location}`);

  const prompt = `Based on this candidate profile, find ${count} companies that:
1. Currently hire for ${profile.targetRoles.join(', ')} roles
2. Use Greenhouse, Lever, or Ashby as their ATS
3. Are a realistic match for the candidate's skills and experience level
4. Have their official careers page on one of these ATS platforms

CANDIDATE:
- Target roles: ${profile.targetRoles.join(', ')}
- Skills: ${profile.skills}
- Experience level: ${profile.experience}
- Location preference: ${profile.location}

Return EXACTLY ${count} companies in this YAML format (no explanations, no extra text):

companies:
  - {ats: greenhouse, slug: company-slug, name: "Company Name"}
  - {ats: lever, slug: company-slug, name: "Company Name"}
  - {ats: ashby, slug: company-slug, name: "Company Name"}

Rules:
- Use "greenhouse", "lever", or "ashby" for ats field
- slug must be the exact company slug used in their ATS URL
- name is the official company name
- Only include companies you can verify use these ATS platforms
- Prefer companies where this candidate's background is a realistic match
- Mix of startup, mid-size, and big tech if possible
- No duplicates`;

  const yamlOutput = await cfAI(prompt);
  const result = parseCompaniesYAML(yamlOutput);
  
  if (!result || !result.companies || !Array.isArray(result.companies)) {
    console.error('Failed to generate valid company list');
    process.exit(1);
  }

  console.log('\n📋 Copy the following into config/portals.yml under the appropriate sections:\n');
  
  // Group by ATS
  const byAts = { greenhouse: [], lever: [], ashby: [] };
  for (const c of result.companies) {
    if (byAts[c.ats]) {
      byAts[c.ats].push(c);
    }
  }

  // Output Greenhouse
  if (byAts.greenhouse.length > 0) {
    console.log('# ─── Greenhouse Companies ─────────────────────────────────────');
    console.log('greenhouse:');
    console.log('  boards:');
    for (const c of byAts.greenhouse) {
      console.log(`    - name: ${c.name}`);
      console.log(`      slug: ${c.slug}`);
    }
    console.log('');
  }

  // Output Lever
  if (byAts.lever.length > 0) {
    console.log('# ─── Lever Companies ──────────────────────────────────────────');
    console.log('lever:');
    console.log('  boards:');
    for (const c of byAts.lever) {
      console.log(`    - name: ${c.name}`);
      console.log(`      slug: ${c.slug}`);
    }
    console.log('');
  }

  // Output Ashby
  if (byAts.ashby.length > 0) {
    console.log('# ─── Ashby Companies ──────────────────────────────────────────');
    console.log('ashby:');
    console.log('  boards:');
    for (const c of byAts.ashby) {
      console.log(`    - name: ${c.name}`);
      console.log(`      slug: ${c.slug}`);
    }
    console.log('');
  }

  // Also output combined format for easy copy-paste
  console.log('# ─── Combined (for companies.yaml style) ──────────────────────');
  console.log('companies:');
  for (const c of result.companies) {
    console.log(`  - {ats: ${c.ats}, slug: ${c.slug}, name: ${c.name}}`);
  }
}

main().catch(e => {
  console.error(`Company discovery failed: ${e.message}`);
  process.exit(1);
});