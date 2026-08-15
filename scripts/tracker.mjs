#!/usr/bin/env node

/**
 * tracker.mjs — Application tracker with interview stages & outcomes
 * Manages data/applications.md with application statuses.
 *
 * Usage:
 *   node scripts/tracker.mjs list                    — Show all applications
 *   node scripts/tracker.mjs add "Company" "Role"    — Add new entry
 *   node scripts/tracker.mjs update "Company" "status" — Update status
 *   node scripts/tracker.mjs interview "Company" "stage" "date" — Add interview stage
 *   node scripts/tracker.mjs outcome "Company" "result" — Record final outcome
 *   node scripts/tracker.mjs followup "Company" "note" — Add follow-up note
 *   node scripts/tracker.mjs export                  — Export as CSV
 *   node scripts/tracker.mjs report                  — Generate HTML dashboard
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TRACKER_PATH = resolve(ROOT, 'data/applications.md');

const VALID_STATUSES = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn'];
const INTERVIEW_STAGES = ['Phone Screen', 'Technical', 'Onsite', 'Final Round', 'HR Round', 'Offer', 'Other'];
const OUTCOMES = ['Applied', 'Interviewing', 'Offer Received', 'Offer Accepted', 'Offer Declined', 'Rejected', 'Ghosted', 'Withdrawn'];

function ensureTracker() {
  const dir = resolve(ROOT, 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(TRACKER_PATH)) {
    writeFileSync(TRACKER_PATH, `# Application Tracker

| # | Company | Role | Status | Applied | Score | Last Update | Interview Stage | Outcome | Follow-up Date | Follow-up Note |
|---|---------|------|--------|---------|-------|-------------|-----------------|---------|----------------|----------------|
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
          interviewStage: cols[7] || '—',
          outcome: cols[8] || '—',
          followupDate: cols[9] || '—',
          followupNote: cols[10] || '—',
        });
      }
    }
  }
  return rows;
}

function writeTracker(rows) {
  let content = `# Application Tracker\n\n| # | Company | Role | Status | Applied | Score | Last Update | Interview Stage | Outcome | Follow-up Date | Follow-up Note |\n|---|---------|------|--------|---------|-------|-------------|-----------------|---------|----------------|----------------|\n`;
  for (const row of rows) {
    content += `| ${row.num} | ${row.company} | ${row.role} | ${row.status} | ${row.applied} | ${row.score} | ${row.lastUpdate} | ${row.interviewStage} | ${row.outcome} | ${row.followupDate} | ${row.followupNote} |\n`;
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
  console.log('| # | Company | Role | Status | Score | Interview | Outcome |');
  console.log('|---|---------|------|--------|-------|-----------|---------|');
  for (const row of rows) {
    console.log(`| ${row.num} | ${row.company} | ${row.role} | ${row.status} | ${row.score} | ${row.interviewStage} | ${row.outcome} |`);
  }

  // Summary
  const statuses = {};
  const outcomes = {};
  for (const row of rows) {
    statuses[row.status] = (statuses[row.status] || 0) + 1;
    if (row.outcome !== '—') {
      outcomes[row.outcome] = (outcomes[row.outcome] || 0) + 1;
    }
  }

  console.log('\n### Status Summary');
  for (const [status, count] of Object.entries(statuses)) {
    console.log(`- ${status}: ${count}`);
  }

  if (Object.keys(outcomes).length > 0) {
    console.log('\n### Outcome Summary');
    for (const [outcome, count] of Object.entries(outcomes)) {
      console.log(`- ${outcome}: ${count}`);
    }
  }

  // Upcoming follow-ups
  const today = new Date().toISOString().split('T')[0];
  const upcomingFollowups = rows.filter(r => r.followupDate !== '—' && r.followupDate >= today);
  if (upcomingFollowups.length > 0) {
    console.log('\n### Upcoming Follow-ups');
    for (const row of upcomingFollowups) {
      console.log(`- [${row.followupDate}] ${row.company}: ${row.followupNote}`);
    }
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
    interviewStage: '—',
    outcome: '—',
    followupDate: '—',
    followupNote: '—',
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

function addInterview(company, stage, date) {
  if (!INTERVIEW_STAGES.includes(stage) && stage !== 'Other') {
    console.error(`Invalid stage. Use: ${INTERVIEW_STAGES.join(', ')}`);
    process.exit(1);
  }

  const rows = readTracker();
  const today = new Date().toISOString().split('T')[0];
  let found = false;

  for (const row of rows) {
    if (row.company.toLowerCase() === company.toLowerCase()) {
      row.interviewStage = stage;
      row.lastUpdate = date || today;
      if (row.status === 'Applied' || row.status === 'Saved') {
        row.status = 'Interviewing';
      }
      found = true;
    }
  }

  if (!found) {
    console.error(`Company "${company}" not found in tracker.`);
    process.exit(1);
  }

  writeTracker(rows);
  console.log(`Interview stage added: ${company} → ${stage}`);
}

function addOutcome(company, outcome) {
  if (!OUTCOMES.includes(outcome)) {
    console.error(`Invalid outcome. Use: ${OUTCOMES.join(', ')}`);
    process.exit(1);
  }

  const rows = readTracker();
  const today = new Date().toISOString().split('T')[0];
  let found = false;

  for (const row of rows) {
    if (row.company.toLowerCase() === company.toLowerCase()) {
      row.outcome = outcome;
      row.lastUpdate = today;
      if (outcome === 'Offer Accepted' || outcome === 'Offer Declined' || outcome === 'Rejected' || outcome === 'Withdrawn') {
        row.status = outcome === 'Offer Accepted' ? 'Offer' : outcome;
      }
      found = true;
    }
  }

  if (!found) {
    console.error(`Company "${company}" not found in tracker.`);
    process.exit(1);
  }

  writeTracker(rows);
  console.log(`Outcome recorded: ${company} → ${outcome}`);
}

function addFollowup(company, note, date) {
  const rows = readTracker();
  const followupDate = date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Default +7 days
  let found = false;

  for (const row of rows) {
    if (row.company.toLowerCase() === company.toLowerCase()) {
      row.followupDate = followupDate;
      row.followupNote = note;
      row.lastUpdate = new Date().toISOString().split('T')[0];
      found = true;
    }
  }

  if (!found) {
    console.error(`Company "${company}" not found in tracker.`);
    process.exit(1);
  }

  writeTracker(rows);
  console.log(`Follow-up added: ${company} on ${followupDate} — ${note}`);
}

function exportCSV() {
  const rows = readTracker();
  let csv = 'Number,Company,Role,Status,Applied,Score,LastUpdate,InterviewStage,Outcome,FollowupDate,FollowupNote\n';
  for (const row of rows) {
    csv += `${row.num},"${row.company}","${row.role}",${row.status},${row.applied},${row.score},${row.lastUpdate},${row.interviewStage},${row.outcome},${row.followupDate},"${row.followupNote}"\n`;
  }
  const csvPath = resolve(ROOT, 'data/tracker-export.csv');
  writeFileSync(csvPath, csv);
  console.log(`Exported to: ${csvPath}`);
}

function generateReport() {
  const child = spawn(process.execPath, [resolve(__dirname, 'html-report.mjs')], { stdio: 'inherit', cwd: ROOT });
  child.on('error', (err) => {
    console.error(`Failed to start html-report.mjs: ${err.message}`);
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code ?? 0));
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
  case 'interview':
    addInterview(process.argv[3], process.argv[4], process.argv[5]);
    break;
  case 'outcome':
    addOutcome(process.argv[3], process.argv[4]);
    break;
  case 'followup':
    addFollowup(process.argv[3], process.argv[4], process.argv[5]);
    break;
  case 'export':
    exportCSV();
    break;
  case 'report':
    generateReport();
    break;
  default:
    console.log('Usage:');
    console.log('  node scripts/tracker.mjs list');
    console.log('  node scripts/tracker.mjs add "Company" "Role"');
    console.log('  node scripts/tracker.mjs update "Company" "status"');
    console.log('  node scripts/tracker.mjs interview "Company" "stage" ["date"]');
    console.log('  node scripts/tracker.mjs outcome "Company" "result"');
    console.log('  node scripts/tracker.mjs followup "Company" "note" ["date"]');
    console.log('  node scripts/tracker.mjs export');
    console.log('  node scripts/tracker.mjs report');
}
