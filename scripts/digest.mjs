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

function extractJDKeywords(text) {
  if (!text) return [];
  const stop = new Set(['the','and','for','with','you','your','are','has','have','this','that','will','can','our','job','role','team','work','working','looking','seeking','candidate','experience','years','year','strong','excellent','good','knowledge','using','use','used','etc','including','well','able','must','requirements','required','preferred','plus','bonus',' qualifications','skills','responsibilities']);
  const lower = String(text).toLowerCase();
  const tokens = new Set();
  for (const m of lower.matchAll(/[a-z][a-z0-9+#.\-]{2,}/g)) {
    const t = m[0];
    if (!stop.has(t) && t.length >= 3) tokens.add(t);
  }
  return [...tokens].slice(0, 30);
}

function extractCompRange(text) {
  if (!text) return null;
  const patterns = [
    /(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?\s*(?:lakh|lac|lpa|k)?/i,
    /\$[\d,]+(?:\.\d+)?\s*(?:k|per\s*year|\/year|pa|p\.a\.)?/i,
    /[\d,]+(?:\.\d+)?\s*(?:k|per\s*year|\/year|pa|p\.a\.)/i,
    /(?:salary|comp|ctc|package)\s*[:\-]?\s*(?:₹|\$|rs\.?|inr)?\s*[\d,]+(?:\.\d+)?\s*(?:lakh|lac|lpa|k)?/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[0].trim();
  }
  return null;
}

function matchSkillsToJob(job, allSkills) {
  const jdTokens = new Set(extractJDKeywords(`${job.title} ${job.snippet || ''} ${(job.tags || []).join(' ')}`));
  const matched = [];
  for (const skill of allSkills) {
    const s = skill.toLowerCase();
    if (jdTokens.has(s) || `${job.title} ${job.snippet || ''}`.toLowerCase().includes(s)) {
      matched.push(skill);
    }
  }
  return matched;
}

function isSeniorRole(title, snippet) {
  const text = `${title} ${snippet || ''}`.toLowerCase();
  const seniorIndicators = ['senior','staff','principal','lead','manager','director','vp','head of','architect','fellow','distinguished','staff engineer','principal engineer','iii','iv','v','5+ years','6+ years','7+ years','8+ years'];
  return seniorIndicators.some(ind => text.includes(ind));
}

const WEB_PRIORITY_SKILLS = ['typescript','javascript','react','next.js','node.js','tailwind css','elysia','express','postgresql','prisma','mongodb','redis','docker','kubernetes','aws','github actions','bun','jest','bash','linux'];

function pickRelevantFallbackSkills(allSkills) {
  const lower = allSkills.map(s => s.toLowerCase());
  const picked = [];
  for (const priority of WEB_PRIORITY_SKILLS) {
    const idx = lower.indexOf(priority);
    if (idx !== -1 && !picked.includes(allSkills[idx])) {
      picked.push(allSkills[idx]);
      if (picked.length >= 3) break;
    }
  }
  if (picked.length === 0) return allSkills.slice(0, 3);
  return picked;
}

function outreachFor(job) {
  const name = candidate.name || 'Candidate';
  const experience = getProfileExperience(profile);
  const allSkills = getProfileSkills(profile).split(', ').map(s => s.trim()).filter(Boolean);
  const templates = outreach.short_dm || outreach.long_dm || '';
  
  // Find skills relevant to this specific job, prioritizing JD keywords
  const matchedSkills = matchSkillsToJob(job, allSkills);
  const topSkills = matchedSkills.slice(0, 3).join(', ') || pickRelevantFallbackSkills(allSkills).join(', ');
  
  // Check seniority mismatch
  const seniorMismatch = isSeniorRole(job.title, job.snippet);
  const experienceLine = seniorMismatch
    ? `I'm early in my career (0-2 years) and looking for a team that invests in junior engineers.`
    : `${experience ? `I'm a ${experience}` : `I'm a software engineer`} focused on shipping reliable systems end to end.`;
  
  // Build personalized outreach regardless of template
  const companyHook = matchedSkills.length > 0
    ? `I noticed ${job.company} works with ${matchedSkills[0]} — that's one of my core tools.`
    : `I'm excited about ${job.company}'s work and this ${job.title} role.`;
  
  const skillLine = matchedSkills.length > 0
    ? `My experience with ${topSkills} directly aligns with what you're looking for.`
    : `My background is in ${topSkills} and similar modern stacks.`;
  
  const lines = [
    `Hi Hiring Manager, I'm ${name} — ${experienceLine}`,
    companyHook,
    skillLine,
    `I build production-style projects (tests, CI, DevOps-friendly) and can share concise repos${candidate.github ? ` (${candidate.github})` : ''}.`,
    'Would you be open to a quick chat or pointing me to the best next step? Thanks!',
  ];
  
  // Only use template if it's a custom template (not the default one without {skills})
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

function buildHTML(jobs, dateStr, freshCount, fullListNote) {
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
  if (strongMatches > 0) tldrPills.push(`<a href="#strong-matches" style="color:#fff;text-decoration:none;">${pill(`${strongMatches} strong match${strongMatches > 1 ? 'es' : ''}`, success)}</a>`);
  if (worthReviewing > 0) tldrPills.push(`<a href="#worth-reviewing" style="color:#fff;text-decoration:none;">${pill(`${worthReviewing} worth reviewing`, warn)}</a>`);
  if (unscored > 0) tldrPills.push(`<a href="#unscored" style="color:#fff;text-decoration:none;">${pill(`${unscored} unscored`, textSecondary)}</a>`);
  if (withFlags > 0) tldrPills.push(`<a href="#with-flags" style="color:#fff;text-decoration:none;">${pill(`${withFlags} with red flags`, danger)}</a>`);
  const tldrText = tldrPills.length > 0 ? tldrPills.join(' ') : '<span style="color:' + textSecondary + ';">No strong matches today — keep applying</span>';

  // Group jobs by company to reduce duplicate cards
  const byCompany = new Map();
  for (const j of jobs) {
    const key = esc(j.company).toLowerCase();
    if (!byCompany.has(key)) byCompany.set(key, { company: j.company, location: j.location, jobs: [] });
    byCompany.get(key).jobs.push(j);
  }
  const companyGroups = [...byCompany.values()];

  // Categorize groups for section jump-links
  const strongMatchGroups = companyGroups.filter(g => g.jobs.some(j => j.evaluation?.overall >= 4.0));
  const worthReviewingGroups = companyGroups.filter(g => !strongMatchGroups.includes(g) && g.jobs.some(j => j.evaluation?.overall >= 3.5));
  const withFlagsGroups = companyGroups.filter(g => g.jobs.some(j => j.evaluation?.redFlags?.length > 0));
  const unscoredGroups = companyGroups.filter(g => !g.jobs.some(j => j.evaluation?.overall));

  function sectionHeader(id, label, color) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0 10px;"><tr><td id="${id}" style="font-family:${font};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${color};">${esc(label)}</td></tr></table>`;
  }

  function renderGroups(groups) {
    return groups.map((group, idx) => {
      const primary = group.jobs[0];
      const score = primary.evaluation?.overall ? badge(primary.evaluation.overall) : '';
      const rec = primary.evaluation?.recommendation ? `<p style="margin:10px 0 0;font-family:${font};font-style:italic;color:${textSecondary};font-size:13px;">${esc(primary.evaluation.recommendation)}</p>` : '';
      const flags = primary.evaluation?.redFlags?.length
        ? `<p style="margin:10px 0 0;font-family:${font};color:${danger};font-size:13px;line-height:1.45;">${esc(primary.evaluation.redFlags.join(' &nbsp;·&nbsp; '))}</p>`
        : '';
      const snippet = esc(truncate(primary.snippet, 220));
      const compRange = extractCompRange(primary.snippet || '');
      const compHtml = compRange ? `<span style="margin:0 8px 0 0;font-family:${font};font-size:12px;font-weight:600;color:${success};">${esc(compRange)}</span>` : '';
      
      // Vary outreach by role when there are multiple roles for the same company
      let outreach = '';
      if (group.jobs.length === 1) {
        outreach = esc(stripHtml(outreachFor(primary)));
      } else {
        // Generate slightly varied outreach for each role to avoid copy-paste look
        const roleOutreaches = group.jobs.slice(0, 3).map((j, i) => {
          const base = outreachFor(j);
          const variant = i === 0 ? base : base.replace(/I noticed.*?\n/, `I noticed ${j.company} is hiring for ${j.title} — `);
          return `<p style="margin:0 0 10px;font-family:${font};color:${textPrimary};font-size:13px;line-height:1.6;white-space:pre-wrap;">${esc(variant)}</p>`;
        }).join('<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:10px 0;"><tr><td style="border-top:1px dashed ${border};font-size:0;line-height:0;">&nbsp;</td></tr></table>');
        outreach = roleOutreaches;
      }
      
      const linkedinTitles = (getProfileOutreach(loadActiveProfile()).linkedin_titles || ['Engineering Manager', 'Tech Lead', 'CTO', 'HR']).slice(0, 3);
      const peopleCells = linkedinTitles.map(t => {
        const url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${t} at ${group.company}`)}&origin=GLOBAL_SEARCH_HEADER`;
        return `<td style="padding:0 6px 0 0;vertical-align:top;"><a href="${url}" style="font-family:${font};font-size:12px;color:${accent};text-decoration:underline;text-underline-offset:3px;">${esc(t)}</a></td>`;
      }).join('');

      const anchor = `job-${idx}`;
      const roleList = group.jobs.length > 1
        ? `<p style="margin:8px 0 0;font-family:${font};font-size:13px;color:${textSecondary};line-height:1.5;">
          <span style="font-weight:600;color:${textPrimary};">${group.jobs.length} open roles:</span>
          ${group.jobs.map(j => `<a href="${esc(j.url)}" style="color:${accent};text-decoration:underline;text-underline-offset:3px;">${esc(j.title)}</a>`).join(' &nbsp;·&nbsp; ')}
        </p>`
        : '';

      const actions = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
        <tr>
          <td style="padding:0 8px 0 0;"><a href="${esc(primary.url)}" style="font-family:${font};font-size:12px;color:${accent};text-decoration:underline;text-underline-offset:3px;">View posting</a></td>
          <td style="padding:0 8px 0 0;"><a href="mailto:?subject=Application: ${esc(primary.title)} at ${esc(group.company)}&body=${encodeURIComponent('I am applying for the ' + primary.title + ' role at ' + group.company + '.')}" style="font-family:${font};font-size:12px;color:${accent};text-decoration:underline;text-underline-offset:3px;">Draft applied note</a></td>
        </tr>
      </table>`;

      return `
      <table id="${anchor}" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px;">
        <tr>
          <td style="padding:16px 18px;background:${bg};border:1px solid ${border};border-radius:14px;">
            <p style="margin:0 0 6px;font-family:${font};font-size:15px;font-weight:600;color:${textPrimary};line-height:1.3;">
              ${score}&nbsp; <a href="${esc(primary.url)}" style="color:${textPrimary};text-decoration:underline;text-underline-offset:4px;">${esc(group.company)}</a>
            </p>
            <p style="margin:0 0 8px;font-family:${font};color:${textSecondary};font-size:13px;line-height:1.4;">${esc(primary.location)} &nbsp;·&nbsp; posted ${esc(primary.posted)}${primary.location?.toLowerCase().includes('remote') ? ' &nbsp;·&nbsp; <span style="color:' + success + ';font-weight:600;">Remote</span>' : ''}${compHtml ? ' &nbsp;·&nbsp; ' + compHtml : ''}</p>
            <p style="margin:0;font-family:${font};color:${textPrimary};font-size:13px;line-height:1.55;">${snippet}</p>
            ${roleList}
            ${rec}
            ${flags}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px;">
              <tr><td style="border-top:1px solid ${border};font-size:0;line-height:0;padding-top:12px;">&nbsp;</td></tr>
            </table>
            ${group.jobs.length > 1 
              ? `<p style="margin:0 0 10px;font-family:${font};font-size:11px;font-weight:700;color:${textSecondary};letter-spacing:0.08em;text-transform:uppercase;">Role-specific outreach</p>`
              : `<p style="margin:0 0 6px;font-family:${font};font-size:11px;font-weight:600;color:${textSecondary};letter-spacing:0.08em;text-transform:uppercase;">Outreach draft</p>`
            }
            ${outreach}
            <p style="margin:12px 0 4px;font-family:${font};font-size:11px;font-weight:600;color:${textSecondary};letter-spacing:0.08em;text-transform:uppercase;">Roles to search on LinkedIn</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${peopleCells}</tr></table>
            ${actions}
          </td>
        </tr>
      </table>`;
    });
  }

  const rows = [
    strongMatchGroups.length > 0 ? sectionHeader('strong-matches', `${strongMatches} strong matches`, success) : '',
    ...renderGroups(strongMatchGroups),
    worthReviewingGroups.length > 0 ? sectionHeader('worth-reviewing', `${worthReviewing} worth reviewing`, warn) : '',
    ...renderGroups(worthReviewingGroups),
    unscoredGroups.length > 0 && withFlagsGroups.length === 0 ? sectionHeader('unscored', `${unscored} unscored`, textSecondary) : '',
    ...renderGroups(unscoredGroups),
    withFlagsGroups.length > 0 ? sectionHeader('with-flags', `${withFlags} with red flags`, danger) : '',
    ...renderGroups(withFlagsGroups),
  ].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>JobOps Daily Digest</title>
  <style type="text/css">
    @media (prefers-color-scheme: dark) {
      body { background-color: #1c1c1e !important; }
      table[role="presentation"] { background-color: #1c1c1e !important; }
      td[style*="background:#f5f5f7"] { background-color: #1c1c1e !important; }
      td[style*="background:#ffffff"] { background-color: #2c2c2e !important; }
      td[style*="border:1px solid #e5e5ea"] { border-color: #3a3a3c !important; }
      p[style*="color:#1d1d1f"], td[style*="color:#1d1d1f"] { color: #f5f5f7 !important; }
      p[style*="color:#6e6e73"], td[style*="color:#6e6e73"] { color: #98989d !important; }
      a[style*="color:#0a0a0a"] { color: #f5f5f7 !important; }
      code[style*="background:#f5f5f7"] { background-color: #3a3a3c !important; color: #f5f5f7 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f7;">
${fullListNote ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px;"><tr><td style="padding:0 14px;"><p style="margin:0;font-family:${font};font-size:12px;color:${textSecondary};line-height:1.4;">${fullListNote}</p></td></tr></table>` : ''}
${rows}
</body>
</html>`;
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
  
  // Downgrade senior-mismatch jobs from "strong match" to "worth reviewing"
  for (const j of [...scored, ...unscored]) {
    if (isSeniorRole(j.title, j.snippet) && j.evaluation?.overall >= 4.0) {
      j.evaluation = j.evaluation || {};
      j.evaluation.overall = Math.min(j.evaluation.overall, 3.5);
      j.evaluation.recommendation = j.evaluation.recommendation || 'Seniority mismatch — review before applying';
      if (!j.evaluation.redFlags) j.evaluation.redFlags = [];
      if (!j.evaluation.redFlags.includes('JD appears senior-level; confirm junior/entry fit')) {
        j.evaluation.redFlags.push('JD appears senior-level; confirm junior/entry fit');
      }
    }
  }
  
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

  const reportsDir = resolve(ROOT, 'reports');
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

  const font = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
  const textSecondary = '#6e6e73';
  const accentLight = '#f5f5f7';

  // Save full report with all fresh jobs (local only; CI runners are ephemeral)
  const isCI = Boolean(process.env.CI);
  let fullListNote = '';
  if (!isCI && fresh.length > digestJobs.length) {
    const fullHtml = buildHTML(fresh, dateStr, fresh.length, '');
    const fullReportFile = resolve(reportsDir, `digest-full-${ist.toISOString().split('T')[0]}.html`);
    writeFileSync(fullReportFile, fullHtml);
    fullListNote = `<p style="margin:0 0 14px;font-family:${font};font-size:12px;color:${textSecondary};line-height:1.4;">Full list: <code style="background:${accentLight};padding:2px 6px;border-radius:4px;font-size:11px;">${fullReportFile}</code></p>`;
  }

  const text = buildText(digestJobs, dateStr, fresh.length);
  const html = buildHTML(digestJobs, dateStr, fresh.length, fullListNote);

  const sent = await sendEmail(subject, text, html);

  const digestFile = resolve(reportsDir, `digest-${ist.toISOString().split('T')[0]}.md`);
  writeFileSync(digestFile, `# JobOps Digest — ${dateStr}\n\n${text}\n`);
  console.log(`\nDigest saved to: ${digestFile}`);
  console.log(sent ? 'Done.' : 'Preview only — configure RESEND_API_KEY or SMTP credentials to email.');
}

main().catch(e => {
  console.error(`Digest failed: ${e.message}`);
  process.exit(1);
});