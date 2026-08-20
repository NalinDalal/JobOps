#!/usr/bin/env node

/**
 * scan.mjs — Multi-portal job scanner
 * Searches RemoteOK, Arbeitnow, Findwork, Remotive, freehire,
 * Greenhouse, Lever, Ashby for matching jobs.
 *
 * Usage: node scripts/scan.mjs "software engineer" "Remote"
 *        node scripts/scan.mjs auto "Remote"   — derive queries from config/profile.yml target_roles
 * Output: JSON array of job listings
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load as yamlLoad } from 'js-yaml';
import { loadActiveProfile, getProfileTargetRoles, getProfileTargetLocations } from './lib/profile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const query = process.argv[2] || 'software engineer';
const location = process.argv[3] || 'Remote';

const fetchT = (url, opts = {}, ms = 15000) =>
  fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });

const jobs = [];
const blacklist = new Set();
const whitelist = new Set();
let blacklistEnabled = true;
let whitelistEnabled = false;
let titleFilter = { positive: [], negative: [] };
let searchQueries = [];
let greenhouseBoards = [];
let leverBoards = [];
let ashbyBoards = [];

// ─── Load config (real YAML, not regex) ────────────────────────
function loadYaml(path) {
  try {
    if (!existsSync(path)) return {};
    return yamlLoad(readFileSync(path, 'utf-8')) || {};
  } catch (e) {
    console.warn(`Could not parse ${path}: ${e.message}`);
    return {};
  }
}

function loadConfig() {
  const cfg = loadYaml(resolve(ROOT, 'config/portals.yml'));

  const bl = cfg.blacklist || {};
  blacklistEnabled = bl.enabled !== false;
  for (const c of (bl.companies || [])) blacklist.add(String(c).toLowerCase());

  const wl = cfg.whitelist || {};
  whitelistEnabled = wl.enabled === true;
  for (const c of (wl.companies || [])) whitelist.add(String(c).toLowerCase());

  titleFilter = cfg.title_filter || { positive: [], negative: [] };

  searchQueries = (cfg.search_queries || [])
    .filter(q => q && q.query && q.enabled !== false)
    .map(q => q.query);

  greenhouseBoards = (cfg.greenhouse?.boards || []).map(b => b.slug).filter(Boolean);
  leverBoards = (cfg.lever?.boards || []).map(b => b.slug).filter(Boolean);
  ashbyBoards = (cfg.ashby?.boards || []).map(b => b.slug).filter(Boolean);
}

function isBlacklisted(company) {
  if (!blacklistEnabled) return false;
  const lower = company.toLowerCase();
  if (whitelistEnabled && whitelist.size > 0) {
    return !Array.from(whitelist).some(w => lower.includes(w));
  }
  return Array.from(blacklist).some(b => lower.includes(b));
}

// ─── Auto queries from active profile ──────────────────────────
function autoQueries() {
  const profile = loadActiveProfile();
  const roles = getProfileTargetRoles(profile);
  return roles;
}

function matchesSearch(text) {
  const activeQuery = globalThis.__query || query;
  const searchLower = activeQuery.toLowerCase();
  const textLower = text.toLowerCase();

  // Check for negative keywords first
  const hasNegative = blacklistEnabled && Array.from(blacklist).some(b => textLower.includes(b));
  if (hasNegative) return false;

  return textLower.includes(searchLower);
}

// ─── RemoteOK ──────────────────────────────────────────────────
async function scanRemoteOK() {
  try {
    const res = await fetchT('https://remoteok.com/api', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    });
    const data = await res.json();
    if (!Array.isArray(data)) return;

    for (const item of data.slice(1)) {
      if (!item.position || !item.company) continue;
      if (isBlacklisted(item.company)) continue;
      const text = `${item.position} ${item.company} ${(item.tags || []).join(' ')}`;
      if (matchesSearch(text)) {
        jobs.push({
          id: jobs.length + 1,
          title: item.position,
          company: item.company,
          location: item.location || 'Remote',
          url: `https://remoteok.com/remote-jobs/${item.id}`,
          source: 'remoteok',
          tags: item.tags || [],
          snippet: (item.description || '').replace(/<[^>]*>/g, '').substring(0, 300),
          posted: item.epoch ? new Date(item.epoch * 1000).toISOString().split('T')[0] : 'Unknown',
        });
      }
    }
  } catch (e) {
    console.error(`RemoteOK error: ${e.message}`);
  }
}

// ─── Arbeitnow ─────────────────────────────────────────────────
async function scanArbeitnow() {
  try {
    const res = await fetchT('https://www.arbeitnow.com/api/job-board-api');
    const data = await res.json();
    if (!data.data) return;

    for (const item of data.data) {
      if (isBlacklisted(item.company_name)) continue;
      const text = `${item.title} ${item.company_name} ${(item.tags || []).join(' ')}`;
      if (matchesSearch(text)) {
        jobs.push({
          id: jobs.length + 1,
          title: item.title,
          company: item.company_name,
          location: item.remote ? 'Remote' : (item.location || 'Not specified'),
          url: item.url,
          source: 'arbeitnow',
          tags: item.tags || [],
          snippet: (item.description || '').replace(/<[^>]*>/g, '').substring(0, 300),
          posted: item.created_at ? (typeof item.created_at === 'string' ? item.created_at.split('T')[0] : new Date(item.created_at).toISOString().split('T')[0]) : 'Unknown',
        });
      }
    }
  } catch (e) {
    console.error(`Arbeitnow error: ${e.message}`);
  }
}

// ─── Findwork ──────────────────────────────────────────────────
async function scanFindwork() {
  try {
    const res = await fetchT('https://findwork.dev/api/jobs/', {
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!data.results) return;

    for (const item of data.results) {
      if (isBlacklisted(item.company_name)) continue;
      const text = `${item.role} ${item.company_name} ${(item.keywords || []).join(' ')}`;
      if (matchesSearch(text)) {
        jobs.push({
          id: jobs.length + 1,
          title: item.role,
          company: item.company_name,
          location: item.location || 'Remote',
          url: item.url,
          source: 'findwork',
          tags: item.keywords || [],
          snippet: (item.text || '').replace(/<[^>]*>/g, '').substring(0, 300),
          posted: item.date_posted || 'Unknown',
        });
      }
    }
  } catch (e) {
    console.error(`Findwork error: ${e.message}`);
  }
}

// ─── Remotive ──────────────────────────────────────────────────
async function scanRemotive() {
  try {
    const res = await fetchT(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!data.jobs) return;

    for (const item of data.jobs) {
      if (isBlacklisted(item.company_name)) continue;
      const text = `${item.title} ${item.company_name} ${(item.tags || []).join(' ')}`;
      if (matchesSearch(text)) {
        jobs.push({
          id: jobs.length + 1,
          title: item.title,
          company: item.company_name,
          location: item.candidate_required_location || 'Remote',
          url: item.url,
          source: 'remotive',
          tags: item.tags || [],
          snippet: (item.description || '').replace(/<[^>]*>/g, '').substring(0, 300),
          posted: item.publication_date ? item.publication_date.split('T')[0] : 'Unknown',
        });
      }
    }
  } catch (e) {
    console.error(`Remotive error: ${e.message}`);
  }
}

// ─── freehire ──────────────────────────────────────────────────
async function scanFreehire() {
  try {
    const res = await fetchT(`https://freehire.me/api/v1/jobs?q=${encodeURIComponent(query)}&remote=true`);
    const data = await res.json();
    if (!data.jobs) return;

    for (const item of data.jobs) {
      if (isBlacklisted(item.company)) continue;
      const text = `${item.title} ${item.company} ${(item.skills || []).join(' ')}`;
      if (matchesSearch(text)) {
        jobs.push({
          id: jobs.length + 1,
          title: item.title,
          company: item.company,
          location: item.remote ? 'Remote' : (item.location || 'Not specified'),
          url: item.url || `https://freehire.me/jobs/${item.id}`,
          source: 'freehire',
          tags: item.skills || [],
          snippet: item.description ? item.description.replace(/<[^>]*>/g, '').substring(0, 300) : '',
          posted: item.posted_at ? item.posted_at.split('T')[0] : 'Unknown',
        });
      }
    }
  } catch (e) {
    console.error(`freehire error: ${e.message}`);
  }
}

// ─── Greenhouse ────────────────────────────────────────────────
async function scanGreenhouse(slug) {
  try {
    const res = await fetchT(`https://api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
    const data = await res.json();
    if (!data.jobs) return;

    for (const item of data.jobs) {
      if (isBlacklisted(item.company_name || item.company || '')) continue;
      const text = `${item.title} ${item.company_name || item.company || ''} ${(item.tags || []).join(' ')}`;
      if (matchesSearch(text)) {
        jobs.push({
          id: jobs.length + 1,
          title: item.title,
          company: item.company_name || item.company || slug,
          location: item.location ? item.location.name : 'Not specified',
          url: item.absolute_url || item.url || `https://boards.greenhouse.io/${slug}/jobs/${item.id}`,
          source: `greenhouse:${slug}`,
          tags: item.tags || [],
          snippet: item.content ? item.content.replace(/<[^>]*>/g, '').substring(0, 300) : '',
          posted: item.updated_at ? item.updated_at.split('T')[0] : 'Unknown',
        });
      }
    }
  } catch (e) {
    console.error(`Greenhouse ${slug} error: ${e.message}`);
  }
}

// ─── Lever ─────────────────────────────────────────────────────
async function scanLever(slug) {
  try {
    const res = await fetchT(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    const data = await res.json();
    if (!Array.isArray(data)) return;

    for (const item of data) {
      if (isBlacklisted(item.company || '')) continue;
      const categories = item.categories || {};
      const text = `${item.text} ${item.title} ${categories.commitment || ''} ${categories.team || ''} ${categories.location || ''}`;
      if (matchesSearch(text)) {
        jobs.push({
          id: jobs.length + 1,
          title: item.text || item.title,
          company: item.company || slug,
          location: categories.location || 'Not specified',
          url: item.hostedUrl || `https://jobs.lever.co/${slug}/${item.id}`,
          source: `lever:${slug}`,
          tags: [categories.team, categories.commitment, categories.location].filter(Boolean),
          snippet: item.description ? item.description.replace(/<[^>]*>/g, '').substring(0, 300) : '',
          posted: item.createdAt ? item.createdAt.split('T')[0] : 'Unknown',
        });
      }
    }
  } catch (e) {
    console.error(`Lever ${slug} error: ${e.message}`);
  }
}

// ─── Ashby ─────────────────────────────────────────────────────
async function scanAshby(slug) {
  try {
    const res = await fetchT(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
    const data = await res.json();
    if (!data.jobs) return;

    for (const item of data.jobs) {
      const company = item.organization || item.company || slug;
      if (isBlacklisted(company)) continue;
      const text = `${item.title} ${company} ${(item.tags || []).join(' ')} ${item.location || ''}`;
      if (matchesSearch(text)) {
        jobs.push({
          id: jobs.length + 1,
          title: item.title,
          company: company,
          location: item.location || 'Not specified',
          url: item.jobUrl || `https://jobs.ashbyhq.com/${slug}`,
          source: `ashby:${slug}`,
          tags: item.tags || [],
          snippet: item.description ? item.description.replace(/<[^>]*>/g, '').substring(0, 300) : '',
          posted: item.publishedDate ? item.publishedDate.split('T')[0] : 'Unknown',
        });
      }
    }
  } catch (e) {
    console.error(`Ashby ${slug} error: ${e.message}`);
  }
}

// ─── Load Greenhouse boards ────────────────────────────────────
async function scanAllGreenhouse() {
  await Promise.all(greenhouseBoards.map(slug => scanGreenhouse(slug)));
}

// ─── Load Lever boards ────────────────────────────────────────
async function scanAllLever() {
  await Promise.all(leverBoards.map(slug => scanLever(slug)));
}

// ─── Load Ashby boards ────────────────────────────────────────
async function scanAllAshby() {
  await Promise.all(ashbyBoards.map(slug => scanAshby(slug)));
}

// ─── Main ──────────────────────────────────────────────────────
async function scanOnce(q) {
  globalThis.__query = q;
  jobs.length = 0;
  await Promise.all([
    scanRemoteOK(),
    scanArbeitnow(),
    scanFindwork(),
    scanRemotive(),
    scanFreehire(),
    scanAllGreenhouse(),
    scanAllLever(),
    scanAllAshby(),
  ]);
  const results = jobs.slice();
  jobs.length = 0;
  return results;
}

async function main() {
  loadConfig();
  const location = process.argv[3] || 'Remote';

  const queries = query.toLowerCase() === 'auto'
    ? (() => {
        const merged = [...autoQueries(), ...searchQueries].map(q => q.trim().toLowerCase()).filter(Boolean);
        return [...new Set(merged)];
      })()
    : [query];

  if (whitelistEnabled) {
    console.log(`  Whitelist mode: only ${whitelist.size} companies`);
  } else if (blacklistEnabled) {
    console.log(`  Blacklist mode: ${blacklist.size} companies excluded`);
  }

  let all = [];
  for (const q of queries) {
    console.log(`Scanning for: "${q}" in "${location}"...`);
    const results = await scanOnce(q);
    console.log(`  -> ${results.length} raw matches`);
    all = all.concat(results);
  }

  // Deduplicate by title+company
  const seen = new Set();
  const unique = all.filter(j => {
    const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Title filter (positive/negative) — enforce what portals.yml declares
  const pos = (titleFilter.positive || []).map(t => String(t).toLowerCase()).filter(Boolean);
  const neg = (titleFilter.negative || []).map(t => String(t).toLowerCase()).filter(Boolean);
  if (neg.length > 0) console.log(`  Title filter: ${pos.length} positive, ${neg.length} negative terms`);

  const filtered = unique.filter(j => {
    const title = String(j.title).toLowerCase();
    if (neg.some(t => title.includes(t))) return false;
    if (pos.length > 0 && !pos.some(t => title.includes(t))) return false;
    return true;
  });

  // Re-number
  filtered.forEach((j, i) => j.id = i + 1);

  // Filter by location if specified
  const located = location.toLowerCase() === 'any'
    ? filtered
    : filtered.filter(j => j.location.toLowerCase().includes(location.toLowerCase()) || j.location === 'Remote');

  console.log(`\nFound ${located.length} jobs:\n`);
  console.log(JSON.stringify(located, null, 2));
}

main();
