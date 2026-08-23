#!/usr/bin/env node

/**
 * profile-generator.mjs — Generate profile.yml from resume using AI
 * 
 * Usage: 
 *   node scripts/profile-generator.mjs resume.pdf
 *   node scripts/profile-generator.mjs resume.txt
 *   node scripts/profile-generator.mjs --text "pasted resume text"
 * 
 * Output: config/profile.yml (overwrites existing)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';

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
          { role: 'system', content: 'You are a resume parser. Extract structured data and return ONLY valid YAML.' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        max_tokens: 4096,
        temperature: 0.1,
      }),
    }
  );
  const data = await res.json();
  return data.result?.choices?.[0]?.message?.content || data.result?.response || '';
}

function extractTextFromFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  const content = readFileSync(filePath, 'utf-8');
  
  if (ext === '.pdf') {
    // For PDF, we'd need a proper parser. For now, return as-is with a note.
    // In production, use pdf-parse or similar.
    console.warn('⚠️  PDF parsing not implemented. Please convert to .txt or paste text directly.');
    console.warn('   You can use: pdftotext resume.pdf resume.txt');
    return content;
  }
  return content;
}

function parseAIResponse(text) {
  try {
    // Extract YAML from response (may be wrapped in code fences)
    const cleaned = text
      .replace(/```ya?ml\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    const match = cleaned.match(/([\s\S]*?)(?:\n---|\n\.\.\.|$)/);
    return yamlLoad(match ? match[1] : cleaned);
  } catch (e) {
    console.error('Failed to parse AI response as YAML:', e.message);
    console.error('Raw response:', text.substring(0, 500));
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let resumeText = '';
  
  if (args.includes('--text')) {
    const idx = args.indexOf('--text');
    if (idx === -1 || idx === args.length - 1) {
      console.error('Usage: --text "your resume text"');
      process.exit(1);
    }
    resumeText = args[idx + 1];
  } else if (args[0]) {
    const filePath = resolve(ROOT, args[0]);
    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    resumeText = extractTextFromFile(filePath);
  } else {
    console.error('Usage: node scripts/profile-generator.mjs <resume.pdf|.txt> OR --text "resume text"');
    process.exit(1);
  }

  if (!resumeText || resumeText.length < 100) {
    console.error('Resume text too short or empty');
    process.exit(1);
  }

  console.log('📄 Generating profile from resume...');

  const prompt = `Parse this resume and generate a JobOps profile.yml. Return ONLY valid YAML.

RESUME:
${resumeText.substring(0, 8000)}

Extract and structure as follows (all fields optional but provide what you can):

candidate:
  name: ""
  email: ""
  phone: ""
  location: ""
  linkedin: ""
  github: ""
  leetcode: ""
  codeforces: ""

skills:
  languages: []
  frameworks: []
  databases: []
  devops: []
  tools: []

target_roles: []
target_locations: []

experience:
  level: "Junior/Entry"  # Junior/Entry, Mid, Senior, Staff, Principal
  years: "0-2"           # 0-2, 2-5, 5-10, 10+
  open_source: false
  competitive_programming: false

preferences:
  remote: true
  salary_range: "Negotiable"
  company_size: "Any"
  company_type:
    - Startup
    - Mid-size
    - Big Tech

autonomy_level: "review-each"

location_preferences:
  positive: []
  negative: []`;

  const yamlOutput = await cfAI(prompt);
  const profile = parseAIResponse(yamlOutput);
  
  if (!profile) {
    console.error('Failed to generate valid profile');
    process.exit(1);
  }

  // Ensure output directory exists
  const configDir = resolve(ROOT, 'config');
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

  const outputPath = resolve(configDir, 'profile.yml');
  const yamlString = yamlDump(profile, { lineWidth: 120, noRefs: true });
  
  writeFileSync(outputPath, yamlString);
  console.log(`\n✅ Profile generated: ${outputPath}`);
  console.log('\n📋 Review the generated profile and adjust as needed.');
  console.log('   Key fields to verify: target_roles, skills, experience.level, target_locations');
}

main().catch(e => {
  console.error(`Profile generation failed: ${e.message}`);
  process.exit(1);
});