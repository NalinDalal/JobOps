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

// ─── Output guards (never trust the model alone) ───────────────
const META_PREFIXES = /^(note:|as requested|here is|below is|here's|the following|certainly[,!]|okay[,:]|done[!.]|i have|i've )/i;

function stripMetaCommentary(text) {
  const lines = text.split('\n');
  const kept = [];
  let stripped = 0;
  let inFence = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) inFence = !inFence;
    if (!inFence && line.trim() && META_PREFIXES.test(line.trim())) {
      stripped++;
      continue;
    }
    kept.push(line);
  }
  if (stripped > 0) console.warn(`⚠️  Stripped ${stripped} meta-commentary / note paragraph(s) from output`);
  return kept.join('\n').trim() + '\n';
}

function extractSkillTokens(text) {
  const tokens = new Set();
  const lines = text.split('\n');
  let inSkills = false;
  for (const line of lines) {
    if (/^#\s*(technical skills|skills)/i.test(line)) { inSkills = true; continue; }
    if (inSkills && /^#\s/.test(line)) break;
    if (!inSkills) continue;
    for (const m of line.toLowerCase().matchAll(/[a-z][a-z0-9+#.-]{1,}/g)) {
      const t = m[0].replace(/^[#.\-+]+|[#.\-+]+$/g, '');
      if (t.length >= 3) tokens.add(t);
    }
  }
  return tokens;
}

function warnFabricatedSkills(tailored, baseCv) {
  const baseTokens = extractSkillTokens(baseCv);
  if (baseTokens.size === 0) return;
  const tailoredTokens = extractSkillTokens(tailored);
  const fabricated = [...tailoredTokens].filter(t => !baseTokens.has(t)).slice(0, 15);
  if (fabricated.length > 0) {
    console.warn(`⚠️  Possible fabricated skill(s) — verify before sending: ${fabricated.join(', ')}`);
  } else {
    console.log('✅ No fabricated skills detected (all skills present in base CV).');
  }
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

Rules (non-negotiable):
1. Only use skills, tools, and experience that appear in BASE CV above. Do NOT add any technology, language, or framework not already present in BASE CV, even if the JD requests it. If a requirement isn't met, omit it — do not imply it.
2. Mirror keywords from the JD naturally.
3. Quantify achievements where possible.
4. Use standard section headers (Experience, Skills, Education).
5. Keep single-column ATS-friendly format.
6. Do NOT fabricate experience — only reframe what exists.

Return ONLY the CV in markdown. No preamble, no notes, no explanation of what you changed, no meta-commentary of any kind. The first character of your response must be the CV content itself.`;

  const clPrompt = `Write a cover letter for ${job.title} at ${job.company}.

CANDIDATE:
${baseCv.substring(0, 2000)}

JOB:
${(job.description || '').substring(0, 2000)}

Rules (non-negotiable):
1. Only reference skills and experience that appear in CANDIDATE above. Do NOT add any technology, language, or framework not already present, even if the JD requests it. If a requirement isn't met, omit it — do not imply it.
2. Under 300 words.
3. Professional but personal tone.
4. Reference specific JD requirements.
5. Include concrete examples from experience.
6. End with call to action.

Return ONLY the cover letter text. No preamble, no notes, no explanation, no "Dear hiring team" meta-commentary beyond the letter itself. The first character of your response must be the letter content itself.`;

  const [cvResult, clResult] = await Promise.all([cfAI(cvPrompt), cfAI(clPrompt)]);

  const cvClean = stripMetaCommentary(cvResult);
  const clClean = stripMetaCommentary(clResult);
  warnFabricatedSkills(cvClean, baseCv);
  warnFabricatedSkills(clClean, baseCv);

  // Save outputs
  const outputDir = resolve(ROOT, 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  
  const slug = `${job.company.toLowerCase().replace(/\s+/g, '-')}`;
  const cvFile = resolve(outputDir, `${slug}-cv.md`);
  const clFile = resolve(outputDir, `${slug}-cover-letter.md`);
  
  writeFileSync(cvFile, cvClean);
  writeFileSync(clFile, clClean);

  console.log(`\n✅ CV saved to: ${cvFile}`);
  console.log(`✅ Cover letter saved to: ${clFile}`);
  console.log(`\nReview both files before applying.`);
}

main();
