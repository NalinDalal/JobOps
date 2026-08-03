#!/usr/bin/env node

/**
 * tailor.mjs — CV tailoring tool
 * Uses Cloudflare Workers AI to generate ATS-optimized CV and cover letter.
 * 
 * Usage: node scripts/tailor.mjs '{"title":"SWE","company":"Stripe","description":"..."}'
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
          { role: 'system', content: 'You are a CV tailoring assistant. Return ATS-optimized markdown.' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        max_tokens: 3000,
        temperature: 0.3,
      }),
    }
  );
  const data = await res.json();
  // Cloudflare returns in result.choices[0].message.content or result.response
  return data.result?.choices?.[0]?.message?.content || data.result?.response || '';
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node scripts/tailor.mjs \'{"title":"...","company":"...","description":"..."}\'');
    process.exit(1);
  }

  const job = JSON.parse(input);
  
  // Load base CV
  const cvPath = resolve(ROOT, 'config/cv.md');
  const baseCv = existsSync(cvPath) ? readFileSync(cvPath, 'utf-8') : 'No CV found. Create config/cv.md first.';

  console.log(`Tailoring CV for: ${job.title} at ${job.company}...`);

  const cvPrompt = `Tailor this CV for ${job.title} at ${job.company}.

JOB DESCRIPTION:
${(job.description || '').substring(0, 3000)}

BASE CV:
${baseCv.substring(0, 4000)}

Rules:
1. Mirror keywords from the JD naturally
2. Quantify achievements where possible
3. Use standard section headers (Experience, Skills, Education)
4. Keep single-column ATS-friendly format
5. Do NOT fabricate experience — only reframe what exists

Return the tailored CV in clean markdown.`;

  const clPrompt = `Write a cover letter for ${job.title} at ${job.company}.

CANDIDATE:
${baseCv.substring(0, 2000)}

JOB:
${(job.description || '').substring(0, 2000)}

Rules:
1. Under 300 words
2. Professional but personal tone
3. Reference specific JD requirements
4. Include concrete examples from experience
5. End with call to action

Return only the cover letter text.`;

  const [cvResult, clResult] = await Promise.all([cfAI(cvPrompt), cfAI(clPrompt)]);

  // Save outputs
  const outputDir = resolve(ROOT, 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  
  const slug = `${job.company.toLowerCase().replace(/\s+/g, '-')}`;
  const cvFile = resolve(outputDir, `${slug}-cv.md`);
  const clFile = resolve(outputDir, `${slug}-cover-letter.md`);
  
  writeFileSync(cvFile, cvResult);
  writeFileSync(clFile, clResult);

  console.log(`\n✅ CV saved to: ${cvFile}`);
  console.log(`✅ Cover letter saved to: ${clFile}`);
  console.log(`\nReview both files before applying.`);
}

main();
