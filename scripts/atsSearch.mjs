#!/usr/bin/env node

/**
 * atsSearch.mjs — Search ATS boards directly via Google dorks
 * These jobs are less competitive than LinkedIn postings.
 *
 * Usage:
 *   node scripts/atsSearch.mjs "software engineer" "India"
 *   node scripts/atsSearch.mjs "frontend react" --boards greenhouse,lever,ashby
 *   node scripts/atsSearch.mjs "product intern" --boards ashby
 *
 * Boards supported:
 *   ashby, greenhouse, lever, icims, jobvite, workday, bamboohr,
 *   smartrecruiters, jazzco, workable
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const ATS_BOARDS = {
  ashby: 'jobs.ashbyhq.com',
  greenhouse: 'boards.greenhouse.io',
  lever: 'jobs.lever.co',
  icims: 'careers.icims.com',
  jobvite: 'jobs.jobvite.com',
  workday: 'wd1.myworkdayjobs.com',
  bamboohr: 'jobs.bamboohr.com',
  smartrecruiters: 'jobs.smartrecruiters.com',
  jazzco: 'apply.jazz.co',
  workable: 'careers.workable.com',
};

const args = process.argv.slice(2);
function argVal(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx === args.length - 1) return fallback;
  return args[idx + 1];
}

const query = args.find(a => !a.startsWith('--')) || 'software engineer';
const location = args.find((a, i) => !a.startsWith('--') && i > 0 && !args[i-1]?.startsWith('--')) || '';
const boardsArg = argVal('boards', 'ashby,greenhouse,lever');
const boards = boardsArg.split(',').map(b => b.trim());

function buildGoogleDorks(query, location, boardSlug, boardDomain) {
  const dorks = [];
  
  // Basic site search
  let searchQuery = `site:${boardSlug}`;
  
  // Add role keywords
  if (query) {
    searchQuery += ` "${query}"`;
  }
  
  // Add location if specified
  if (location && location !== 'any') {
    searchQuery += ` "${location}"`;
  }
  
  // Build the URL
  const encoded = encodeURIComponent(searchQuery);
  const url = `https://www.google.com/search?q=${encoded}&num=20`;
  
  return {
    board: boardSlug,
    domain: boardDomain,
    query: searchQuery,
    url,
    // Alternative: direct ATS search URLs
    directUrls: getDirectSearchUrls(query, location, boardSlug),
  };
}

function getDirectSearchUrls(query, location, boardSlug) {
  const urls = [];
  const encodedQuery = encodeURIComponent(query);
  const encodedLocation = encodeURIComponent(location || '');
  
  switch (boardSlug) {
    case 'jobs.ashbyhq.com':
      urls.push(`https://jobs.ashbyhq.com/?query=${encodedQuery}${location ? `&location=${encodedLocation}` : ''}`);
      break;
    case 'boards.greenhouse.io':
      // Greenhouse doesn't have a global search, but we can search specific boards
      urls.push(`https://boards.greenhouse.io/embed/job_board?for=${encodedQuery}`);
      break;
    case 'jobs.lever.co':
      urls.push(`https://jobs.lever.co/search?q=${encodedQuery}${location ? `&location=${encodedLocation}` : ''}`);
      break;
    default:
      urls.push(`https://${boardSlug}/search?q=${encodedQuery}`);
  }
  
  return urls;
}

async function searchBoard(board, query, location) {
  const domain = ATS_BOARDS[board];
  if (!domain) {
    console.error(`Unknown board: ${board}`);
    return [];
  }
  
  const dork = buildGoogleDorks(query, location, domain, board);
  
  console.log(`\n Searching ${board} (${domain})...`);
  console.log(`   Query: ${dork.query}`);
  console.log(`   Direct: ${dork.directUrls[0]}`);
  
  // Try to fetch the direct search URL
  const results = [];
  
  for (const url of dork.directUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(10000),
      });
      
      if (res.ok) {
        const html = await res.text();
        const parsed = parseJobListings(html, board, domain);
        results.push(...parsed);
        console.log(`    Found ${parsed.length} listings`);
      } else {
        console.log(`     HTTP ${res.status} — may need browser access`);
      }
    } catch (e) {
      console.log(`     ${e.message}`);
    }
  }
  
  return results;
}

function parseJobListings(html, board, domain) {
  const jobs = [];
  
  // Common patterns for job listing pages
  const patterns = [
    // Ashby
    /<a[^>]*href="(https:\/\/jobs\.ashbyhq\.com\/[^"]*)"[^>]*>([^<]*)<\/a>/gi,
    // Greenhouse
    /<a[^>]*href="(https:\/\/boards\.greenhouse\.io\/[^"]*)"[^>]*>([^<]*)<\/a>/gi,
    // Lever
    /<a[^>]*href="(https:\/\/jobs\.lever\.co\/[^"]*)"[^>]*>([^<]*)<\/a>/gi,
    // Generic
    /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*class="[^"]*job[^"]*"[^>]*>([^<]*)<\/a>/gi,
    /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*class="[^"]*position[^"]*"[^>]*>([^<]*)<\/a>/gi,
    /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*class="[^"]*posting[^"]*"[^>]*>([^<]*)<\/a>/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const url = match[1];
      const title = match[2].trim();
      
      if (title && title.length > 3 && !title.includes('Cookie') && !title.includes('Sign')) {
        // Extract company from URL
        let company = '';
        if (url.includes('ashbyhq.com')) {
          company = url.split('ashbyhq.com/')[1]?.split('/')[0] || '';
        } else if (url.includes('greenhouse.io')) {
          company = url.split('greenhouse.io/')[1]?.split('/')[0] || '';
        } else if (url.includes('lever.co')) {
          company = url.split('lever.co/')[1]?.split('/')[0] || '';
        }
        
        jobs.push({
          title,
          company: company.charAt(0).toUpperCase() + company.slice(1),
          url,
          source: board,
        });
      }
    }
  }
  
  return jobs;
}

async function main() {
  console.log(`\n ATS Board Search`);
  console.log(`   Query: "${query}"`);
  console.log(`   Location: ${location || 'any'}`);
  console.log(`   Boards: ${boards.join(', ')}`);
  
  const allJobs = [];
  
  for (const board of boards) {
    const results = await searchBoard(board, query, location);
    allJobs.push(...results);
  }
  
  // Deduplicate by URL
  const seen = new Set();
  const unique = allJobs.filter(j => {
    if (seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });
  
  console.log(`\n Total: ${unique.length} unique listings across ${boards.length} boards`);
  
  if (unique.length > 0) {
    console.log('\nJobs found:\n');
    unique.forEach((j, i) => {
      console.log(`  ${i + 1}. ${j.title} @ ${j.company}`);
      console.log(`     ${j.url}`);
      console.log(`     Source: ${j.source}`);
    });
  }
  
  // Save results
  const date = new Date().toISOString().split('T')[0];
  const resultsDir = resolve(ROOT, 'data');
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });
  const resultsFile = resolve(resultsDir, `atsSearch-${date}.json`);
  writeFileSync(resultsFile, JSON.stringify(unique, null, 2));
  console.log(`\n Results saved to: ${resultsFile}`);
  
  // Print Google dorks for manual search
  console.log('\n Google Dorks for manual search:\n');
  for (const board of boards) {
    const domain = ATS_BOARDS[board];
    if (domain) {
      let dork = `site:${domain} "${query}"`;
      if (location && location !== 'any') dork += ` "${location}"`;
      console.log(`  ${dork}`);
    }
  }
}

main().catch(e => {
  console.error(`ATS search failed: ${e.message}`);
  process.exit(1);
});
