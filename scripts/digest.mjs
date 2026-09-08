#!/usr/bin/env node

/**
 * digest.mjs — Daily job digest (push mode for JobOps)
 * Scans all portals, filters fresh jobs, optionally scores the top N
 * with Cloudflare AI, generates a LinkedIn outreach blurb per role,
 * and emails the digest via Resend or SMTP.
 * 
 * Usage:
 *   node scripts/digest.mjs                          — preview to console (no email)
 *   node scripts/digest.mjs --mode daily             — email digest, marks jobs as seen
 *   node scripts/digest.mjs --max 10                 — limit email to N jobs
 *   node scripts/digest.mjs --evaluate 0             — disable AI scoring
 *   node scripts/digest.mjs --query "backend"        — custom scan query (default: auto from profile.yml)
 *   node scripts/digest.mjs --query auto             — scan each target_role from config/profile.yml
 *   node scripts/digest.mjs --mock                   — use mock data for testing
 *   node scripts/digest.mjs --send                   — send email (alias for --mode daily)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { load as yamlLoad } from 'js-yaml';
import { loadActiveProfile, getProfileCandidate, getProfileSkills, getProfileExperience, getProfileOutreach, getProfileTargetLocations } from './lib/profile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SEEN_PATH = resolve(ROOT, 'data/digest-seen.json');

// ─── Args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argVal(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx === args.length - 1) return fallback;
  return args[idx + 1];
}
function argFlag(name) {
  return args.includes(`--${name}`);
}

const MODE = argFlag('send') || argFlag('daily') ? 'daily' : argVal('mode', 'preview');
const MAX_JOBS = parseInt(argVal('max', '50'), 10) || 50;
const EVAL_TOP = parseInt(argVal('evaluate', '5'), 10) || 0;
const QUERY = argVal('query', 'auto');
const MOCK_MODE = argFlag('mock');

// ─── Load search.yml config ──────────────────────────────────────
function loadSearchConfig() {
  try {
    const cfg = yamlLoad(readFileSync(resolve(ROOT, 'config/search.yml'), 'utf-8')) || {};
    return {
      score_threshold: cfg.score_threshold || 3.5,
      max_per_digest: cfg.max_per_digest || 10,
      max_age_days: cfg.max_age_days || 30,
    };
  } catch {
    return { score_threshold: 3.5, max_per_digest: 10, max_age_days: 30 };
  }
}
const searchConfig = loadSearchConfig();

// ─── Env ─────────────────────────────────────────────────────────
const envPath = resolve(ROOT, '.env');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  }
}
const HAS_CF_KEYS = (process.env.CLOUDFLARE_API_KEY || process.env.CLOUDFLARE_API_TOKEN) && process.env.CLOUDFLARE_ACCOUNT_ID;

// ─── Profile ─────────────────────────────────────────────────────
const profile = loadActiveProfile();
const candidate = getProfileCandidate(profile);
const outreach = getProfileOutreach(profile);

function matchSkillsToJob(job, allSkills) {
  const text = `${job.title} ${job.snippet || ''} ${(job.tags || []).join(' ')}`.toLowerCase();
  const matched = [];
  for (const skill of allSkills) {
    if (text.includes(skill.toLowerCase())) {
      matched.push(skill);
    }
  }
  return matched;
}

function outreachFor(job) {
  const name = candidate.name || 'Candidate';
  const experience = getProfileExperience(profile);
  const allSkills = getProfileSkills(profile).split(', ').map(s => s.trim()).filter(Boolean);
  const templates = outreach.short_dm || outreach.long_dm || '';
  
  // Find skills relevant to this specific job
  const matchedSkills = matchSkillsToJob(job, allSkills);
  const topSkills = matchedSkills.slice(0, 3).join(', ') || allSkills.slice(0, 3).join(', ');
  
  // Build personalized outreach regardless of template
  const skillLine = matchedSkills.length > 0
    ? `My experience with ${topSkills} directly aligns with what you're looking for.`
    : `I build production-style projects with ${topSkills} and similar modern stacks.`;
  
  const companyHook = matchedSkills.length > 0
    ? `I noticed ${job.company} uses ${matchedSkills[0]} — that's one of my core tools.`
    : `I'm excited about ${job.company}'s work and this ${job.title} role.`;
  
  const lines = [
    `Hi Hiring Manager, I'm ${name} — a ${experience || 'software'} engineer.`,
    companyHook,
    skillLine,
    `I build production-style projects (tests, CI, DevOps-friendly) and can share concise repos${candidate.github ? ` (${candidate.github})` : ''}.`,
    'Would you be open to a quick chat or pointing me to the best next step? Thanks!',
  ];
  
  // Only use template if it's a custom template (not the default one without {skills})
  // The default template doesn't have {skills}, so we always use personalized outreach
  if (templates && templates.includes('{skills}')) {
    return templates
      .replace(/\{Name\}/g, 'Hiring Manager')
      .replace(/\{candidate_name\}/g, name)
      .replace(/\{experience_level\}/g, experience || 'software')
      .replace(/\{skills\}/g, topSkills)
      .replace(/\{role\}/g, job.title)
      .replace(/\{company\}/g, job.company);
  }
  
  return lines.join('\n');
}

// ─── Seen database (dedup) ──────────────────────────────────────
function loadSeen() {
  try {
    if (existsSync(SEEN_PATH)) {
      const data = JSON.parse(readFileSync(SEEN_PATH, 'utf-8'));
      return new Set(data.seen || []);
    }
  } catch {}
  return new Set();
}

function saveSeen(seen) {
  mkdirSync(resolve(ROOT, 'data'), { recursive: true });
  writeFileSync(SEEN_PATH, JSON.stringify({ seen: [...seen].sort(), updated: new Date().toISOString() }, null, 2));
}

const jobId = j => `${j.company}::${j.title}::${j.url}`;

// ─── Scan ────────────────────────────────────────────────────────
function runScan() {
  const scanArgs = [resolve(ROOT, 'scripts/scan.mjs')];
  if (QUERY !== 'auto') scanArgs.push(QUERY);
  else scanArgs.push('auto');
  scanArgs.push('any'); // location
  if (MOCK_MODE) scanArgs.push('--mock');
  
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, scanArgs, { cwd: ROOT });
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

// ─── Evaluation (optional, top N) ────────────────────────────────
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
  if (!HAS_CF_KEYS || limit <= 0 || fresh.length === 0) return;
  const targets = fresh.slice(0, limit);
  console.log(`Evaluating top ${targets.length} jobs with Cloudflare AI...`);
  const results = await Promise.allSettled(targets.map(j => evaluateJob(j)));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      targets[i].evaluation = r.value;
    }
  });
}

// ─── Email helpers ───────────────────────────────────────────────
function stripHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function esc(s) {
  return stripHtml(s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
}

function truncate(s, maxLen = 200) {
  const clean = stripHtml(s);
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

function buildHTML(jobs, dateStr, freshCount) {
  const accent = '#0a0a0a';
  const accentLight = '#f5f5f7';
  const textPrimary = '#1d1d1f';
  const textSecondary = '#6e6e73';
  const success = '#2d6a4f';
  const warn = '#b45309';
  const danger = '#c41e3a';
  const border = '#e5e5ea';
  const bg = '#ffffff';
  const font = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

  function badge(score) {
    const bgc = score >= 4 ? '#2d6a4f' : score >= 3.5 ? '#b45309' : '#6e6e73';
    return `<span style="display:inline-block;background:${bgc};color:#fff;font-size:11px;font-weight:600;letter-spacing:0.02em;padding:2px 10px;border-radius:12px;line-height:18px;">${score.toFixed(1)}/5</span>`;
  }
  function pill(label, color) {
    return `<span style="display:inline-block;background:${color};color:#fff;font-size:11px;font-weight:600;letter-spacing:0.02em;padding:2px 10px;border-radius:12px;line-height:18px;">${esc(label)}</span>`;
  }
  function pillWrap(html) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;"><tr><td style="padding:14px 16px;background:${accentLight};border:1px solid ${border};border-radius:12px;"><p style="margin:0;font-family:${font};color:${textPrimary};font-size:14px;line-height:1.5;">${html}</p></td></tr></table>`;
  }
  function sectionDivider() {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:22px 0 6px;"><tr><td style="border-top:1px solid ${border};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
  }

  const strongMatches = jobs.filter(j => j.evaluation?.overall >= 4.0).length;
  const worthReviewing = jobs.filter(j => j.evaluation?.overall >= 3.5 && j.evaluation?.overall < 4.0).length;
  const withFlags = jobs.filter(j => j.evaluation?.redFlags?.length > 0).length;
  const unscored = jobs.filter(j => !j.evaluation?.overall).length;

  const tldrPills = [];
  if (strongMatches > 0) tldrPills.push(pill(`${strongMatches} strong match${strongMatches > 1 ? 'es' : ''}`, success));
  if (worthReviewing > 0) tldrPills.push(pill(`${worthReviewing} worth reviewing`, warn));
  if (unscored > 0) tldrPills.push(pill(`${unscored} unscored`, textSecondary));
  if (withFlags > 0) tldrPills.push(pill(`${withFlags} with red flags`, danger));
  const tldrText = tldrPills.length > 0 ? tldrPills.join(' ') : '<span style="color:' + textSecondary + ';">No strong matches today — keep applying</span>';

  const rows = jobs.map(j => {
    const score = j.evaluation?.overall ? badge(j.evaluation.overall) : '';
    const rec = j.evaluation?.recommendation ? `<p style="margin:10px 0 0;font-family:${font};font-style:italic;color:${textSecondary};font-size:13px;">${esc(j.evaluation.recommendation)}</p>` : '';
    const flags = j.evaluation?.redFlags?.length
      ? `<p style="margin:10px 0 0;font-family:${font};color:${danger};font-size:13px;line-height:1.45;">${esc(j.evaluation.redFlags.join(' &nbsp;·&nbsp; '))}</p>`
      : '';
    const snippet = esc(truncate(j.snippet, 220));
    const outreach = esc(stripHtml(outreachFor(j)));
    const linkedinTitles = (getProfileOutreach(loadActiveProfile()).linkedin_titles || ['Engineering Manager', 'Tech Lead', 'CTO', 'HR']).slice(0, 3);
    const peopleCells = linkedinTitles.map(t => {
      const url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${t} at ${j.company}`)}&origin=GLOBAL_SEARCH_HEADER`;
      return `<td style="padding:0 6px 0 0;vertical-align:top;"><a href="${url}" style="font-family:${font};font-size:12px;color:${accent};text-decoration:underline;text-underline-offset:3px;">${esc(t)}</a></td>`;
    }).join('');
    return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px;">
      <tr>
        <td style="padding:16px 18px;background:${bg};border:1px solid ${border};border-radius:14px;">
          <p style="margin:0 0 6px;font-family:${font};font-size:15px;font-weight:600;color:${textPrimary};line-height:1.3;">
            ${score}&nbsp; <a href="${esc(j.url)}" style="color:${textPrimary};text-decoration:underline;text-underline-offset:4px;">${esc(j.title)}</a>
          </p>
          <p style="margin:0 0 8px;font-family:${font};color:${textSecondary};font-size:13px;line-height:1.4;">${esc(j.company)} &nbsp;·&nbsp; ${esc(j.location)} &nbsp;·&nbsp; posted ${esc(j.posted)}</p>
          <p style="margin:0;font-family:${font};color:${textPrimary};font-size:13px;line-height:1.55;">${snippet}</p>
          ${rec}
          ${flags}
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px;">
            <tr><td style="border-top:1px solid ${border};font-size:0;line-height:0;padding-top:12px;">&nbsp;</td></tr>
          </table>
          <p style="margin:0 0 6px;font-family:${font};font-size:11px;font-weight:600;color:${textSecondary};letter-spacing:0.08em;text-transform:uppercase;">Outreach draft</p>
          <p style="margin:0;font-family:${font};color:${textPrimary};font-size:13px;line-height:1.6;white-space:pre-wrap;">${outreach}</p>
          <p style="margin:12px 0 4px;font-family:${font};font-size:11px;font-weight:600;color:${textSecondary};letter-spacing:0.08em;text-transform:uppercase;">People to contact</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${peopleCells}</tr></table>
        </td>
      </tr>
    </table>`;
  }).join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f5f7;padding:24px 0;font-family:${font};color:${textPrimary};">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;padding:0 14px;">
      <tr><td style="margin:0 auto;width:100%;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${textSecondary};">JobOps</p>
        <h1 style="margin:0 0 18px;font-size:22px;font-weight:600;color:${textPrimary};line-height:1.25;letter-spacing:-0.01em;">Daily Digest</h1>
        <p style="margin:0 0 14px;font-size:13px;color:${textSecondary};line-height:1.4;">${freshCount} new job(s) found &nbsp;·&nbsp; ${jobs.length} shown</p>
        ${tldrText ? pillWrap(tldrText) : ''}
        ${rows}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:6px;">
          <tr><td style="border-top:1px solid ${border};font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:${textSecondary};line-height:1.45;">Generated by JobOps. Scores are estimates — review before applying.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

function buildText(jobs, dateStr, freshCount) {
  const strongMatches = jobs.filter(j => j.evaluation?.overall >= 4.0).length;
  const worthReviewing = jobs.filter(j => j.evaluation?.overall >= 3.5 && j.evaluation?.overall < 4.0).length;
  const withFlags = jobs.filter(j => j.evaluation?.redFlags?.length > 0).length;
  const unscored = jobs.filter(j => !j.evaluation?.overall).length;

  const lines = [`JobOps Daily Digest — ${dateStr}`, `${freshCount} new job(s)`, ''];
  
  // TL;DR
  const tldr = [];
  if (strongMatches > 0) tldr.push(`${strongMatches} strong match${strongMatches > 1 ? 'es' : ''}`);
  if (worthReviewing > 0) tldr.push(`${worthReviewing} worth reviewing`);
  if (unscored > 0) tldr.push(`${unscored} unscored`);
  if (withFlags > 0) tldr.push(`${withFlags} with red flags`);
  if (tldr.length > 0) lines.push(`TL;DR: ${tldr.join(' · ')}`, '');
  for (const j of jobs) {
    const score = j.evaluation?.overall ? ` [${j.evaluation.overall.toFixed(1)}/5]` : '';
    lines.push(`${j.title}${score} — ${j.company} (${j.location})`);
    lines.push(`  ${j.url}`);
    if (j.evaluation?.recommendation) lines.push(`  Rec: ${j.evaluation.recommendation}`);
    if (j.evaluation?.redFlags?.length) lines.push(`   ${j.evaluation.redFlags.join(' • ')}`);
    const outreachLines = outreachFor(j).split('\n');
    lines.push(`  Outreach: ${outreachLines.join('\n         ')}`);
    lines.push('');
  }
  lines.push('--- LinkedIn outreach drafts + scores via JobOps ---');
  return lines.join('\n');
}

// ─── Email via Resend ───────────────────────────────────────────
async function sendEmailResend(subject, text, html) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  const to = process.env.MAIL_TO;
  if (!key || !from || !to) return false;
  
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body.substring(0, 300)}`);
  }
  console.log(`Email sent via Resend to ${to}`);
  return true;
}

// ─── Email via SMTP (Gmail App Password) ────────────────────────
async function sendEmailSMTP(subject, text, html) {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.MAIL_TO;
  const from = process.env.MAIL_FROM || user;
  
  if (!user || !pass || !to) return false;
  
  // Use nodemailer if available, otherwise fallback to basic fetch
  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    console.log(`Email sent via SMTP to ${to}`);
    return true;
  } catch (e) {
    console.warn('SMTP send failed (nodemailer not installed?):', e.message);
    return false;
  }
}

async function sendEmail(subject, text, html) {
  // Try Resend first, then SMTP
  if (process.env.RESEND_API_KEY) {
    return sendEmailResend(subject, text, html);
  }
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    return sendEmailSMTP(subject, text, html);
  }
  
  console.log('\n[email] No RESEND_API_KEY or SMTP credentials — printing digest instead.\n');
  console.log(`Subject: ${subject}\n`);
  console.log(text);
  return false;
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  console.log(`Digest mode=${MODE} query="${QUERY}" max=${MAX_JOBS} evaluate=${HAS_CF_KEYS ? EVAL_TOP : 0} mock=${MOCK_MODE}`);
  console.log(`Config: score_threshold=${searchConfig.score_threshold} max_per_digest=${searchConfig.max_per_digest} max_age_days=${searchConfig.max_age_days}`);

  const all = await runScan();
  const seen = loadSeen();
  const fresh = all.filter(j => !seen.has(jobId(j)));
  console.log(`Scanned: ${all.length} jobs | Fresh: ${fresh.length}`);

  await evaluateTop(fresh, EVAL_TOP);

  // Filter by score threshold
  const threshold = searchConfig.score_threshold;
  const scored = fresh.filter(j => j.evaluation?.overall && j.evaluation.overall >= threshold);
  const unscored = fresh.filter(j => !j.evaluation?.overall);
  const belowThreshold = fresh.filter(j => j.evaluation?.overall && j.evaluation.overall < threshold);
  
  console.log(`Score filter (>= ${threshold}): ${fresh.length} → ${scored.length} above, ${belowThreshold.length} below, ${unscored.length} unscored`);

  scored.sort((a, b) => b.evaluation.overall - a.evaluation.overall);
  unscored.sort((a, b) => String(b.posted).localeCompare(String(a.posted)));
  
  // Combine: scored first, then unscored, limit to max_per_digest
  const maxDigest = Math.min(searchConfig.max_per_digest, MAX_JOBS);
  const digestJobs = [...scored, ...unscored].slice(0, maxDigest);

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
  console.log(sent ? 'Done.' : 'Preview only — configure RESEND_API_KEY or SMTP credentials to email.');
}

main().catch(e => {
  console.error(`Digest failed: ${e.message}`);
  process.exit(1);
});