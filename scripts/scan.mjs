#!/usr/bin/env node

/**
 * scan.mjs — Multi-portal job scanner
 * Searches RemoteOK, Arbeitnow, Findwork, Remotive, freehire,
 * Greenhouse, Lever, Ashby for matching jobs.
 * 
 * Usage: 
 *   node scripts/scan.mjs "software engineer" "Remote"
 *   node scripts/scan.mjs auto "Remote"        — derive queries from config/profile.yml target_roles
 *   node scripts/scan.mjs --mock               — use mock data for testing
 *   node scripts/scan.mjs --config             — show loaded config
 * Output: JSON array of job listings
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load as yamlLoad } from 'js-yaml';
import { loadActiveProfile, getProfileTargetRoles, getProfileTargetLocations } from './lib/profile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Parse args
const args = process.argv.slice(2);
const MOCK_MODE = args.includes('--mock');
const SHOW_CONFIG = args.includes('--config');
const QUERY = args.find(a => !a.startsWith('--')) || 'software engineer';
const LOCATION = args.find((a, i) => !a.startsWith('--') && args[i-1] !== '--mock' && i > 0) || 'Remote';

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

// Search config from search.yml
let searchConfig = {
  include_titles: [],
  exclude_titles: [],
  locations: [],
  allow_remote: true,
  max_age_days: 30,
  score_threshold: 3.5,
  max_per_digest: 10,
  portals: {
    api_portals: true,
    greenhouse: true,
    lever: true,
    ashby: true,
  },
  query_mode: 'auto',
  custom_query: '',
  mock_mode: false,
};

// ─── Load YAML helper ────────────────────────────────────────────
function loadYaml(path) {
  try {
    if (!existsSync(path)) return {};
    return yamlLoad(readFileSync(path, 'utf-8')) || {};
  } catch (e) {
    console.warn(`Could not parse ${path}: ${e.message}`);
    return {};
  }
}

// ─── Load portals.yml ────────────────────────────────────────────
function loadPortalsConfig() {
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

// ─── Load search.yml ─────────────────────────────────────────────
function loadSearchConfig() {
  const cfg = loadYaml(resolve(ROOT, 'config/search.yml'));
  
  searchConfig = {
    include_titles: cfg.include_titles || [],
    exclude_titles: cfg.exclude_titles || [],
    locations: cfg.locations || [],
    allow_remote: cfg.allow_remote !== false,
    max_age_days: cfg.max_age_days || 30,
    score_threshold: cfg.score_threshold || 3.5,
    max_per_digest: cfg.max_per_digest || 10,
    portals: cfg.portals || {
      api_portals: true,
      greenhouse: true,
      lever: true,
      ashby: true,
    },
    query_mode: cfg.query_mode || 'auto',
    custom_query: cfg.custom_query || '',
    mock_mode: cfg.mock_mode || false,
  };
}

function isBlacklisted(company) {
  if (!blacklistEnabled) return false;
  const lower = company.toLowerCase();
  if (whitelistEnabled && whitelist.size > 0) {
    return !Array.from(whitelist).some(w => lower.includes(w));
  }
  return Array.from(blacklist).some(b => lower.includes(b));
}

// ─── Auto queries from active profile ────────────────────────────
function autoQueries() {
  const profile = loadActiveProfile();
  const roles = getProfileTargetRoles(profile);
  return roles;
}

function matchesSearch(text) {
  const activeQuery = globalThis.__query || QUERY;
  const searchLower = activeQuery.toLowerCase();
  const textLower = text.toLowerCase();

  // Check for negative keywords (company blacklist)
  const hasNegative = blacklistEnabled && Array.from(blacklist).some(b => textLower.includes(b));
  if (hasNegative) return false;

  return textLower.includes(searchLower);
}

// ─── Title filter using search.yml include/exclude ───────────────
function matchesTitleFilter(title) {
  const titleLower = title.toLowerCase();
  
  // Check exclude first (negative filter)
  for (const excl of searchConfig.exclude_titles) {
    if (titleLower.includes(excl.toLowerCase())) return false;
  }
  
  // Check include (positive filter) - if list not empty, must match at least one
  if (searchConfig.include_titles.length > 0) {
    let matched = false;
    for (const incl of searchConfig.include_titles) {
      if (titleLower.includes(incl.toLowerCase())) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  
  return true;
}

// ─── Location filter using search.yml ────────────────────────────
function matchesLocationFilter(location) {
  const locLower = location.toLowerCase();
  
  // Allow remote if configured
  if (searchConfig.allow_remote && locLower === 'remote') return true;
  
  // Check against configured locations
  for (const loc of searchConfig.locations) {
    if (locLower.includes(loc.toLowerCase())) return true;
  }
  
  return false;
}

// ─── Age filter ──────────────────────────────────────────────────
function isFreshEnough(posted) {
  if (searchConfig.max_age_days <= 0) return true;
  if (!posted || posted === 'Unknown') return true; // Keep unknown dates
  
  const postedDate = new Date(posted);
  if (isNaN(postedDate.getTime())) return true;
  
  const now = new Date();
  const diffDays = (now - postedDate) / (1000 * 60 * 60 * 24);
  return diffDays <= searchConfig.max_age_days;
}

// ─── Mock data generator ─────────────────────────────────────────
function generateMockJobs() {
  const mockJobs = [
    {
      title: 'Software Engineer',
      company: 'Stripe',
      location: 'San Francisco, CA (Remote OK)',
      url: 'https://boards.greenhouse.io/stripe/jobs/123456',
      source: 'greenhouse:stripe',
      tags: ['React', 'TypeScript', 'Node.js', 'AWS'],
      snippet: 'Build scalable payment infrastructure. Work with React, TypeScript, and distributed systems.',
      posted: new Date().toISOString().split('T')[0],
    },
    {
      title: 'Full Stack Developer',
      company: 'Vercel',
      location: 'Remote',
      url: 'https://boards.greenhouse.io/vercel/jobs/789012',
      source: 'greenhouse:vercel',
      tags: ['Next.js', 'React', 'TypeScript', 'Edge Functions'],
      snippet: 'Build the future of frontend infrastructure. Experience with Next.js and React required.',
      posted: new Date().toISOString().split('T')[0],
    },
    {
      title: 'Backend Engineer',
      company: 'Supabase',
      location: 'Remote',
      url: 'https://jobs.lever.co/supabase/abc123',
      source: 'lever:supabase',
      tags: ['PostgreSQL', 'TypeScript', 'Rust', 'AWS'],
      snippet: 'Build open-source Firebase alternative. Strong PostgreSQL and TypeScript skills needed.',
      posted: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
    {
      title: 'Frontend Engineer',
      company: 'Linear',
      location: 'Remote',
      url: 'https://jobs.ashbyhq.com/linear/xyz789',
      source: 'ashby:linear',
      tags: ['React', 'TypeScript', 'GraphQL', 'Electron'],
      snippet: 'Build delightful issue tracking. React, TypeScript, and GraphQL experience preferred.',
      posted: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
    {
      title: 'Junior Software Engineer',
      company: 'Railway',
      location: 'Remote',
      url: 'https://boards.greenhouse.io/railway/jobs/456789',
      source: 'greenhouse:railway',
      tags: ['Node.js', 'TypeScript', 'Docker', 'Kubernetes'],
      snippet: 'Deploy infrastructure with ease. Entry-level role with mentorship.',
      posted: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
  ];
  
  return mockJobs.map((j, i) => ({ ...j, id: i + 1 }));
}

// ─── RemoteOK ────────────────────────────────────────────────────
async function scanRemoteOK() {
  if (MOCK_MODE || searchConfig.mock_mode) return;
  
  try {
    const res = await fetchT('https://remoteok.com/api', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    });
    const data = await res.json();
    if (!Array.isArray(data)) return;

    for (const item of data.slice(1)) {
      if (!item.position || !item.company) continue;
      if (isBlacklisted(item.company)) continue;
      if (!matchesSearch(`${item.position} ${item.company} ${(item.tags || []).join(' ')}`)) continue;
      
      const posted = item.epoch ? new Date(item.epoch * 1000).toISOString().split('T')[0] : 'Unknown';
      if (!isFreshEnough(posted)) continue;
      
      jobs.push({
        id: jobs.length + 1,
        title: item.position,
        company: item.company,
        location: item.location || 'Remote',
        url: `https://remoteok.com/remote-jobs/${item.id}`,
        source: 'remoteok',
        tags: item.tags || [],
        snippet: (item.description || '').replace(/<[^>]*>/g, '').substring(0, 300),
        posted,
      });
    }
  } catch (e) {
    console.error(`RemoteOK error: ${e.message}`);
  }
}

// ─── Arbeitnow ───────────────────────────────────────────────────
async function scanArbeitnow() {
  if (MOCK_MODE || searchConfig.mock_mode) return;
  
  try {
    const res = await fetchT('https://www.arbeitnow.com/api/job-board-api');
    const data = await res.json();
    if (!data.data) return;

    for (const item of data.data) {
      if (isBlacklisted(item.company_name)) continue;
      if (!matchesSearch(`${item.title} ${item.company_name} ${(item.tags || []).join(' ')}`)) continue;
      
      const posted = item.created_at ? new Date((typeof item.created_at === 'number' ? item.created_at * 1000 : item.created_at)).toISOString().split('T')[0] : 'Unknown';
      if (!isFreshEnough(posted)) continue;
      
      jobs.push({
        id: jobs.length + 1,
        title: item.title,
        company: item.company_name,
        location: item.remote ? 'Remote' : (item.location || 'Not specified'),
        url: item.url,
        source: 'arbeitnow',
        tags: item.tags || [],
        snippet: (item.description || '').replace(/<[^>]*>/g, '').substring(0, 300),
        posted,
      });
    }
  } catch (e) {
    console.error(`Arbeitnow error: ${e.message}`);
  }
}

// ─── Findwork ────────────────────────────────────────────────────
async function scanFindwork() {
  if (MOCK_MODE || searchConfig.mock_mode) return;
  
  try {
    const res = await fetchT('https://findwork.dev/api/jobs/', {
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!data.results) return;

    for (const item of data.results) {
      if (isBlacklisted(item.company_name)) continue;
      if (!matchesSearch(`${item.role} ${item.company_name} ${(item.keywords || []).join(' ')}`)) continue;
      
      const posted = item.date_posted || 'Unknown';
      if (!isFreshEnough(posted)) continue;
      
      jobs.push({
        id: jobs.length + 1,
        title: item.role,
        company: item.company_name,
        location: item.location || 'Remote',
        url: item.url,
        source: 'findwork',
        tags: item.keywords || [],
        snippet: (item.text || '').replace(/<[^>]*>/g, '').substring(0, 300),
        posted,
      });
    }
  } catch (e) {
    console.error(`Findwork error: ${e.message}`);
  }
}

// ─── Remotive ────────────────────────────────────────────────────
async function scanRemotive() {
  if (MOCK_MODE || searchConfig.mock_mode) return;
  
  try {
    const res = await fetchT(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(QUERY)}`);
    const data = await res.json();
    if (!data.jobs) return;

    for (const item of data.jobs) {
      if (isBlacklisted(item.company_name)) continue;
      if (!matchesSearch(`${item.title} ${item.company_name} ${(item.tags || []).join(' ')}`)) continue;
      
      const posted = item.publication_date ? item.publication_date.split('T')[0] : 'Unknown';
      if (!isFreshEnough(posted)) continue;
      
      jobs.push({
        id: jobs.length + 1,
        title: item.title,
        company: item.company_name,
        location: item.candidate_required_location || 'Remote',
        url: item.url,
        source: 'remotive',
        tags: item.tags || [],
        snippet: (item.description || '').replace(/<[^>]*>/g, '').substring(0, 300),
        posted,
      });
    }
  } catch (e) {
    console.error(`Remotive error: ${e.message}`);
  }
}

// ─── freehire ────────────────────────────────────────────────────
async function scanFreehire() {
  if (MOCK_MODE || searchConfig.mock_mode) return;
  
  try {
    const res = await fetchT(`https://freehire.me/api/v1/jobs?q=${encodeURIComponent(QUERY)}&remote=true`);
    const data = await res.json();
    if (!data.jobs) return;

    for (const item of data.jobs) {
      if (isBlacklisted(item.company)) continue;
      if (!matchesSearch(`${item.title} ${item.company} ${(item.skills || []).join(' ')}`)) continue;
      
      const posted = item.posted_at ? item.posted_at.split('T')[0] : 'Unknown';
      if (!isFreshEnough(posted)) continue;
      
      jobs.push({
        id: jobs.length + 1,
        title: item.title,
        company: item.company,
        location: item.remote ? 'Remote' : (item.location || 'Not specified'),
        url: item.url || `https://freehire.me/jobs/${item.id}`,
        source: 'freehire',
        tags: item.skills || [],
        snippet: item.description ? item.description.replace(/<[^>]*>/g, '').substring(0, 300) : '',
        posted,
      });
    }
  } catch (e) {
    console.error(`freehire error: ${e.message}`);
  }
}

// ─── Greenhouse ──────────────────────────────────────────────────
async function scanGreenhouse(slug) {
  if (MOCK_MODE || searchConfig.mock_mode) return;
  if (!searchConfig.portals.greenhouse) return;
  
  try {
    const res = await fetchT(`https://api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
    const data = await res.json();
    if (!data.jobs) return;

    for (const item of data.jobs) {
      if (isBlacklisted(item.company_name || item.company || '')) continue;
      if (!matchesSearch(`${item.title} ${item.company_name || item.company || ''} ${(item.tags || []).join(' ')}`)) continue;
      
      const posted = item.updated_at ? item.updated_at.split('T')[0] : 'Unknown';
      if (!isFreshEnough(posted)) continue;
      
      jobs.push({
        id: jobs.length + 1,
        title: item.title,
        company: item.company_name || item.company || slug,
        location: item.location ? item.location.name : 'Not specified',
        url: item.absolute_url || item.url || `https://boards.greenhouse.io/${slug}/jobs/${item.id}`,
        source: `greenhouse:${slug}`,
        tags: item.tags || [],
        snippet: item.content ? item.content.replace(/<[^>]*>/g, '').substring(0, 300) : '',
        posted,
      });
    }
  } catch (e) {
    console.error(`Greenhouse ${slug} error: ${e.message}`);
  }
}

// ─── Lever ───────────────────────────────────────────────────────
async function scanLever(slug) {
  if (MOCK_MODE || searchConfig.mock_mode) return;
  if (!searchConfig.portals.lever) return;
  
  try {
    const res = await fetchT(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    const data = await res.json();
    if (!Array.isArray(data)) return;

    for (const item of data) {
      if (isBlacklisted(item.company || '')) continue;
      const categories = item.categories || {};
      if (!matchesSearch(`${item.text} ${item.title} ${categories.commitment || ''} ${categories.team || ''} ${categories.location || ''}`)) continue;
      
      const posted = item.createdAt ? item.createdAt.split('T')[0] : 'Unknown';
      if (!isFreshEnough(posted)) continue;
      
      jobs.push({
        id: jobs.length + 1,
        title: item.text || item.title,
        company: item.company || slug,
        location: categories.location || 'Not specified',
        url: item.hostedUrl || `https://jobs.lever.co/${slug}/${item.id}`,
        source: `lever:${slug}`,
        tags: [categories.team, categories.commitment, categories.location].filter(Boolean),
        snippet: item.description ? item.description.replace(/<[^>]*>/g, '').substring(0, 300) : '',
        posted,
      });
    }
  } catch (e) {
    console.error(`Lever ${slug} error: ${e.message}`);
  }
}

// ─── Ashby ───────────────────────────────────────────────────────
async function scanAshby(slug) {
  if (MOCK_MODE || searchConfig.mock_mode) return;
  if (!searchConfig.portals.ashby) return;
  
  try {
    const res = await fetchT(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
    const data = await res.json();
    if (!data.jobs) return;

    for (const item of data.jobs) {
      const company = item.organization || item.company || slug;
      if (isBlacklisted(company)) continue;
      if (!matchesSearch(`${item.title} ${company} ${(item.tags || []).join(' ')} ${item.location || ''}`)) continue;
      
      const posted = (item.publishedAt || item.publishedDate || item.createdAt) ? String(item.publishedAt || item.publishedDate || item.createdAt).split('T')[0] : 'Unknown';
      if (!isFreshEnough(posted)) continue;
      
      jobs.push({
        id: jobs.length + 1,
        title: item.title,
        company: company,
        location: item.location || 'Not specified',
        url: item.jobUrl || `https://jobs.ashbyhq.com/${slug}`,
        source: `ashby:${slug}`,
        tags: item.tags || [],
        snippet: item.description ? item.description.replace(/<[^>]*>/g, '').substring(0, 300) : '',
        posted,
      });
    }
  } catch (e) {
    console.error(`Ashby ${slug} error: ${e.message}`);
  }
}

// ─── Scan all boards ─────────────────────────────────────────────
async function scanAllGreenhouse() {
  await Promise.all(greenhouseBoards.map(slug => scanGreenhouse(slug)));
}

async function scanAllLever() {
  await Promise.all(leverBoards.map(slug => scanLever(slug)));
}

async function scanAllAshby() {
  await Promise.all(ashbyBoards.map(slug => scanAshby(slug)));
}

// ─── Main scan function ──────────────────────────────────────────
async function scanOnce(q) {
  globalThis.__query = q;
  jobs.length = 0;
  
  const tasks = [];
  
  if (searchConfig.portals.api_portals) {
    tasks.push(scanRemoteOK(), scanArbeitnow(), scanFindwork(), scanRemotive(), scanFreehire());
  }
  if (searchConfig.portals.greenhouse) tasks.push(scanAllGreenhouse());
  if (searchConfig.portals.lever) tasks.push(scanAllLever());
  if (searchConfig.portals.ashby) tasks.push(scanAllAshby());
  
  await Promise.all(tasks);
  const results = jobs.slice();
  jobs.length = 0;
  return results;
}

async function main() {
  loadPortalsConfig();
  loadSearchConfig();
  
  if (MOCK_MODE) searchConfig.mock_mode = true;
  
  if (SHOW_CONFIG) {
    console.log('Loaded search config:');
    console.log(JSON.stringify(searchConfig, null, 2));
    return;
  }

  if (searchConfig.mock_mode) {
    console.log('🧪 Mock mode enabled - using sample data');
  }

  const location = LOCATION;
  let queries;
  
  if (searchConfig.query_mode === 'auto' || QUERY.toLowerCase() === 'auto') {
    const merged = [...autoQueries(), ...searchQueries].map(q => q.trim().toLowerCase()).filter(Boolean);
    queries = [...new Set(merged)];
  } else if (searchConfig.custom_query) {
    queries = [searchConfig.custom_query];
  } else {
    queries = [QUERY];
  }

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

  // Add mock jobs if in mock mode
  if (MOCK_MODE || searchConfig.mock_mode) {
    const mockJobs = generateMockJobs();
    console.log(`  -> Adding ${mockJobs.length} mock jobs`);
    all = all.concat(mockJobs);
  }

  // Deduplicate by title+company
  const seen = new Set();
  const unique = all.filter(j => {
    const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Title filter using search.yml include/exclude
  const filtered = unique.filter(j => matchesTitleFilter(j.title));

  // Location filter using search.yml
  const located = filtered.filter(j => matchesLocationFilter(j.location));

  // Age filter
  const fresh = located.filter(j => isFreshEnough(j.posted));

  // Re-number
  fresh.forEach((j, i) => j.id = i + 1);

  console.log(`\nFilters applied:`);
  console.log(`  Title filter: ${unique.length} → ${filtered.length}`);
  console.log(`  Location filter: ${filtered.length} → ${located.length}`);
  console.log(`  Age filter (${searchConfig.max_age_days} days): ${located.length} → ${fresh.length}`);
  console.log(`\nFound ${fresh.length} jobs:\n`);
  console.log(JSON.stringify(fresh, null, 2));
}

main();