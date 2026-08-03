#!/usr/bin/env node

/**
 * tracker.mjs — Application tracker
 * Manages data/applications.md with application statuses.
 * 
 * Usage:
 *   node scripts/tracker.mjs list                    — Show all applications
 *   node scripts/tracker.mjs add "Company" "Role"    — Add new entry
 *   node scripts/tracker.mjs update "Company" "status" — Update status
 *   node scripts/tracker.mjs export                  — Export as CSV
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TRACKER_PATH = resolve(ROOT, 'data/applications.md');

const VALID_STATUSES = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn'];

function ensureTracker() {
  const dir = resolve(ROOT, 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(TRACKER_PATH)) {
    writeFileSync(TRACKER_PATH, `# Application Tracker

| # | Company | Role | Status | Applied | Score | Last Update |
|---|---------|------|--------|---------|-------|-------------|
`);
  }
}

function readTracker() {
  ensureTracker();
  const content = readFileSync(TRACKER_PATH, 'utf-8');
  const rows = [];
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.startsWith('|') && !line.startsWith('| #') && !line.startsWith('|---')) {
      const cols = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 4) {
        rows.push({
          num: cols[0],
          company: cols[1],
          role: cols[2],
          status: cols[3],
          applied: cols[4] || '—',
          score: cols[5] || '—',
          lastUpdate: cols[6] || '—',
        });
      }
    }
  }
  return rows;
}

function writeTracker(rows) {
  let content = `# Application Tracker\n\n| # | Company | Role | Status | Applied | Score | Last Update |\n|---|---------|------|--------|---------|-------|-------------|\n`;
  for (const row of rows) {
    content += `| ${row.num} | ${row.company} | ${row.role} | ${row.status} | ${row.applied} | ${row.score} | ${row.lastUpdate} |\n`;
  }
  writeFileSync(TRACKER_PATH, content);
}

function list() {
  const rows = readTracker();
  if (rows.length === 0) {
    console.log('No applications tracked yet.');
    return;
  }
  
  console.log('\n## Application Tracker\n');
  console.log('| # | Company | Role | Status | Score |');
  console.log('|---|---------|------|--------|-------|');
  for (const row of rows) {
    console.log(`| ${row.num} | ${row.company} | ${row.role} | ${row.status} | ${row.score} |`);
  }
  
  // Summary
  const statuses = {};
  for (const row of rows) {
    statuses[row.status] = (statuses[row.status] || 0) + 1;
  }
  console.log('\n### Summary');
  for (const [status, count] of Object.entries(statuses)) {
    console.log(`- ${status}: ${count}`);
  }
}

function add(company, role) {
  const rows = readTracker();
  const num = rows.length + 1;
  const today = new Date().toISOString().split('T')[0];
  rows.push({
    num: String(num),
    company,
    role,
    status: 'Saved',
    applied: '—',
    score: '—',
    lastUpdate: today,
  });
  writeTracker(rows);
  console.log(`Added: ${company} — ${role} (Status: Saved)`);
}

function update(company, status) {
  if (!VALID_STATUSES.includes(status)) {
    console.error(`Invalid status. Use: ${VALID_STATUSES.join(', ')}`);
    process.exit(1);
  }
  
  const rows = readTracker();
  const today = new Date().toISOString().split('T')[0];
  let found = false;
  
  for (const row of rows) {
    if (row.company.toLowerCase() === company.toLowerCase()) {
      row.status = status;
      row.lastUpdate = today;
      if (status === 'Applied') row.applied = today;
      found = true;
    }
  }
  
  if (!found) {
    console.error(`Company "${company}" not found in tracker.`);
    process.exit(1);
  }
  
  writeTracker(rows);
  console.log(`Updated: ${company} → ${status}`);
}

function exportCSV() {
  const rows = readTracker();
  let csv = 'Number,Company,Role,Status,Applied,Score,LastUpdate\n';
  for (const row of rows) {
    csv += `${row.num},"${row.company}","${row.role}",${row.status},${row.applied},${row.score},${row.lastUpdate}\n`;
  }
  const csvPath = resolve(ROOT, 'data/tracker-export.csv');
  writeFileSync(csvPath, csv);
  console.log(`Exported to: ${csvPath}`);
}

// ─── Main ──────────────────────────────────────────────────────
const command = process.argv[2];

switch (command) {
  case 'list':
    list();
    break;
  case 'add':
    add(process.argv[3], process.argv[4]);
    break;
  case 'update':
    update(process.argv[3], process.argv[4]);
    break;
  case 'export':
    exportCSV();
    break;
  default:
    console.log('Usage:');
    console.log('  node scripts/tracker.mjs list');
    console.log('  node scripts/tracker.mjs add "Company" "Role"');
    console.log('  node scripts/tracker.mjs update "Company" "status"');
    console.log('  node scripts/tracker.mjs export');
}
