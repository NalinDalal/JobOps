#!/usr/bin/env node

/**
 * digest.mjs — Daily job digest (push mode for JobOps)
 * Scans all portals, filters fresh jobs, optionally scores the top N
 * with Cloudflare AI, generates a LinkedIn outreach blurb per role,
 * and emails the digest via Resend.
 *
 * Usage:
 *   node scripts/digest.mjs                          — preview to console (no email)
 *   node scripts/digest.mjs --mode daily             — email digest, marks jobs as seen
 *   node scripts/digest.mjs --max 10                 — limit email to N jobs
 *   node scripts/digest.mjs --evaluate 0             — disable AI scoring
 *   node scripts/digest.mjs --query "backend"        — custom scan query (default: auto from profile.yml)
 *   node scripts/digest.mjs --query auto             — scan each target_role from config/profile.yml
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { load as yamlLoad } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SEEN_PATH = resolve(ROOT, 'data/digest-seen.json');

// ─── Args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argVal(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx === args.length - 1) return fallback;
  return args[idx + 1];
}
const MODE = argVal('mode', 'preview');
const MAX_JOBS = parseInt(argVal('max', '50'), 10) || 50;
const EVAL_TOP = parseInt(argVal('evaluate', '5'), 10) || 0;
const QUERY = argVal('query', 'auto');

// ─── Env ───────────────────────────────────────────────────────
const envPath = resolve(ROOT, '.env');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  }
}
const HAS_KEYS = (process.env.CLOUDFLARE_API_KEY || process.env.CLOUDFLARE_API_TOKEN) && process.env.CLOUDFLARE_ACCOUNT_ID;

// ─── Profile ───────────────────────────────────────────────────
function loadProfile() {
  let name = 'Nalin';
  let skills = 'TypeScript, React, Node.js, Go';
  let github = '';
  let linkedin = '';
  let experience = 'junior';
  const profilePath = resolve(ROOT, 'config/profile.yml');
  if (existsSync(profilePath)) {
    try {
      const p = yamlLoad(readFileSync(profilePath, 'utf-8')) || {};
      const s = p.skills || {};
      const cat = (...keys) => keys.flatMap(k => s[k] || []).filter(Boolean);
      if (p.candidate?.name) name = p.candidate.name;
      if (p.skills) skills = cat('languages', 'frameworks', 'databases', 'devops', 'tools').join(', ').substring(0, 200);
      if (p.candidate?.github) github = p.candidate.github;
      if (p.candidate?.linkedin) linkedin = p.candidate.linkedin;
      if (p.experience?.level) experience = String(p.experience.level).toLowerCase();
    } catch (e) {
      console.warn(`Could not parse profile.yml: ${e.message}`);
    }
  }
  return { name, skills, github, linkedin, experience };
}

const profile = loadProfile();

function outreachFor(job) {
  const lines = [
    `Hi {Name}, I'm ${profile.name} — a ${profile.experience} engineer focused on ${profile.skills}.`,
    `I'm excited about ${job.company}'s work and this ${job.title} role. I build production-style projects (tests, CI, DevOps-friendly) and can share concise repos${profile.github ? ` (${profile.github})` : ''}.`,
    'Would you be open to a quick chat or pointing me to the best next step? Thanks!',
  ];
  return lines.join('\n');
}

// ─── Seen database (dedup) ─────────────────────────────────────
function loadSeen() {
  try {
    if (existsSync(SEEN_PATH)) {
      return new Set(JSON.parse(readFileSync(SEEN_PATH, 'utf-8')).seen || []);
    }
  } catch {}
  return new Set();
}

function saveSeen(seen) {
  mkdirSync(resolve(ROOT, 'data'), { recursive: true });
  writeFileSync(SEEN_PATH, JSON.stringify({ seen: [...seen].sort(), updated: new Date().toISOString() }, null, 2));
}

const jobId = j => `${j.company}::${j.title}::${j.url}`;

// ─── Scan ──────────────────────────────────────────────────────
function runScan() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [resolve(ROOT, 'scripts/scan.mjs'), QUERY, 'any'], { cwd: ROOT });
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

// ─── Evaluation (optional, top N) ──────────────────────────────
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

async function evaluateTop(fresh, limit) {
  if (!HAS_KEYS || limit <= 0 || fresh.length === 0) return;
  const targets = fresh.slice(0, limit);
  console.log(`Evaluating top ${targets.length} jobs with Cloudflare AI...`);
  const results = await Promise.allSettled(targets.map(j => evaluateJob(j)));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      targets[i].evaluation = r.value;
    }
  });
}

// ─── Email via Resend ─────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function buildHTML(jobs, dateStr, freshCount) {
  const rows = jobs.map(j => {
    const score = j.evaluation?.overall ? `<span style="background:#111;color:#fff;border-radius:4px;padding:2px 8px;font-weight:bold;">${j.evaluation.overall.toFixed(1)}/5</span>` : '';
    const rec = j.evaluation?.recommendation ? `<p><em>${esc(j.evaluation.recommendation)}</em></p>` : '';
    const flags = j.evaluation?.redFlags?.length
      ? `<p style="color:#b91c1c;">⚠ ${esc(j.evaluation.redFlags.join(' • '))}</p>`
      : '';
    const outreach = esc(outreachFor(j)).replace(/<br>/g, '\n').replace(/\n/g, '<br>');
    return `
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:12px;">
    <h3 style="margin:0 0 4px;">${score}&nbsp; <a href="${j.url}" style="color:#111;">${esc(j.title)}</a></h3>
    <p style="margin:0 0 8px;color:#555;">${esc(j.company)} · ${esc(j.location)} · posted ${esc(j.posted)}</p>
    ${rec}
    <p style="color:#333;">${esc(j.snippet)}</p>
    ${flags}
    <details style="margin-top:8px;">
      <summary style="cursor:pointer;color:#2563eb;font-size:14px;">LinkedIn outreach draft</summary>
      <pre style="white-space:pre-wrap;background:#f9fafb;border-radius:6px;padding:10px;font-family:sans-serif;font-size:13px;">${outreach}</pre>
    </details>
  </div>`;
  }).join('\n');

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:680px;margin:auto;">
  <h2>JobOps Daily Digest — ${dateStr}</h2>
  <p>${freshCount} new job(s) found across ${jobs.length} shown. Full list is in your tracker pipeline.</p>
  ${rows}
  <p style="color:#777;font-size:12px;">Generated by JobOps (career-apply-jobs). Scores are AI estimates — review before applying.</p>
</div>`;
}

function buildText(jobs, dateStr, freshCount) {
  const lines = [`JobOps Daily Digest — ${dateStr}`, `${freshCount} new job(s)`, ''];
  for (const j of jobs) {
    const score = j.evaluation?.overall ? ` [${j.evaluation.overall.toFixed(1)}/5]` : '';
    lines.push(`${j.title}${score} — ${j.company} (${j.location})`);
    lines.push(`  ${j.url}`);
    if (j.evaluation?.recommendation) lines.push(`  Rec: ${j.evaluation.recommendation}`);
    if (j.evaluation?.redFlags?.length) lines.push(`  ⚠ ${j.evaluation.redFlags.join(' • ')}`);
    lines.push('');
  }
  lines.push('--- LinkedIn outreach drafts + scores via JobOps ---');
  return lines.join('\n');
}

async function sendEmail(subject, text, html) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  const to = process.env.MAIL_TO;
  if (!key || !from || !to) {
    console.log('\n[email] No RESEND_API_KEY/MAIL_FROM/MAIL_TO — printing digest instead.\n');
    console.log(`Subject: ${subject}\n`);
    console.log(text);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body.substring(0, 300)}`);
  }
  console.log(`Email sent to ${to}`);
  return true;
}

// ─── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(`Digest mode=${MODE} query="${QUERY}" max=${MAX_JOBS} evaluate=${HAS_KEYS ? EVAL_TOP : 0}`);

  const all = await runScan();
  const seen = loadSeen();
  const fresh = all.filter(j => !seen.has(jobId(j)));
  console.log(`Scanned: ${all.length} jobs | Fresh: ${fresh.length}`);

  await evaluateTop(fresh, EVAL_TOP);

  const scored = fresh.filter(j => j.evaluation?.overall);
  const rest = fresh.filter(j => !j.evaluation?.overall);
  scored.sort((a, b) => b.evaluation.overall - a.evaluation.overall);
  rest.sort((a, b) => String(b.posted).localeCompare(String(a.posted)));
  const digestJobs = [...scored, ...rest].slice(0, MAX_JOBS);

  if (MODE === 'daily') {
    fresh.forEach(j => seen.add(jobId(j)));
    saveSeen(seen);
  }

  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const dateStr = ist.toISOString().replace('T', ' ').substring(0, 16) + ' IST';
  const subject = `JobOps Digest — ${fresh.length} new jobs (${dateStr.slice(0, 11)})`;

  const text = buildText(digestJobs, dateStr, fresh.length);
  const html = buildHTML(digestJobs, dateStr, fresh.length);

  const sent = await sendEmail(subject, text, html);

  const reportsDir = resolve(ROOT, 'reports');
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  const digestFile = resolve(reportsDir, `digest-${ist.toISOString().split('T')[0]}.md`);
  writeFileSync(digestFile, `# JobOps Digest — ${dateStr}\n\n${text}\n`);
  console.log(`\nDigest saved to: ${digestFile}`);
  console.log(sent ? 'Done.' : 'Preview only — run with RESEND env vars to email.');
}

main().catch(e => {
  console.error(`Digest failed: ${e.message}`);
  process.exit(1);
});