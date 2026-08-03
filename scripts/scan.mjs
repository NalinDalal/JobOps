#!/usr/bin/env node

/**
 * scan.mjs — Job portal scanner
 * Searches RemoteOK, Arbeitnow, and other free APIs for matching jobs.
 * 
 * Usage: node scripts/scan.mjs "software engineer" "Remote"
 * Output: JSON array of job listings
 */

const query = process.argv[2] || 'software engineer';
const location = process.argv[3] || 'Remote';

const jobs = [];

// ─── RemoteOK ──────────────────────────────────────────────────
async function scanRemoteOK() {
  try {
    const res = await fetch('https://remoteok.com/api', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    });
    const data = await res.json();
    
    if (!Array.isArray(data)) return;
    
    const searchLower = query.toLowerCase();
    for (const item of data.slice(1)) {
      if (!item.position || !item.company) continue;
      const text = `${item.position} ${item.company} ${(item.tags || []).join(' ')}`.toLowerCase();
      if (text.includes(searchLower)) {
        jobs.push({
          id: jobs.length + 1,
          title: item.position,
          company: item.company,
          location: item.location || 'Remote',
          url: `https://remoteok.com/remote-jobs/${item.id}`,
          source: 'remoteok',
          tags: item.tags || [],
          snippet: (item.description || '').replace(/<[^>]*>/g, '').substring(0, 300),
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
    const res = await fetch('https://www.arbeitnow.com/api/job-board-api');
    const data = await res.json();
    
    if (!data.data) return;
    
    const searchLower = query.toLowerCase();
    for (const item of data.data) {
      const text = `${item.title} ${item.company_name} ${(item.tags || []).join(' ')}`.toLowerCase();
      if (text.includes(searchLower)) {
        jobs.push({
          id: jobs.length + 1,
          title: item.title,
          company: item.company_name,
          location: item.remote ? 'Remote' : (item.location || 'Not specified'),
          url: item.url,
          source: 'arbeitnow',
          tags: item.tags || [],
          snippet: (item.description || '').replace(/<[^>]*>/g, '').substring(0, 300),
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
    const res = await fetch('https://findwork.dev/api/jobs/', {
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    
    if (!data.results) return;
    
    const searchLower = query.toLowerCase();
    for (const item of data.results) {
      const text = `${item.role} ${item.company_name} ${(item.keywords || []).join(' ')}`.toLowerCase();
      if (text.includes(searchLower)) {
        jobs.push({
          id: jobs.length + 1,
          title: item.role,
          company: item.company_name,
          location: item.location || 'Remote',
          url: item.url,
          source: 'findwork',
          tags: item.keywords || [],
          snippet: (item.text || '').replace(/<[^>]*>/g, '').substring(0, 300),
        });
      }
    }
  } catch (e) {
    console.error(`Findwork error: ${e.message}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(`Scanning for: "${query}" in "${location}"...`);
  
  await Promise.all([
    scanRemoteOK(),
    scanArbeitnow(),
    scanFindwork(),
  ]);
  
  // Deduplicate by title+company
  const seen = new Set();
  const unique = jobs.filter(j => {
    const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  // Re-number
  unique.forEach((j, i) => j.id = i + 1);
  
  // Filter by location if specified
  const filtered = location.toLowerCase() === 'any' 
    ? unique 
    : unique.filter(j => j.location.toLowerCase().includes(location.toLowerCase()) || j.location === 'Remote');
  
  console.log(`\nFound ${filtered.length} jobs:\n`);
  console.log(JSON.stringify(filtered, null, 2));
}

main();
