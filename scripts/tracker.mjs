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

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { load as yamlLoad } from 'js-yaml';
import { loadActiveProfile, getProfileAutonomyLevel } from './lib/profile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TRACKER_PATH = resolve(ROOT, 'data/applications.md');

const VALID_STATUSES = ['Saved', 'Attention', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn'];
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

function listAttention() {
  const rows = readTracker();
  const attention = rows.filter(r => r.status === 'Attention');
  if (attention.length === 0) {
    console.log('Attention queue is empty.');
    return;
  }
  console.log('\n## Attention Queue\n');
  console.log('| # | Company | Role | Score | Last Update |');
  console.log('|---|---------|------|-------|-------------|');
  for (const row of attention) {
    console.log(`| ${row.num} | ${row.company} | ${row.role} | ${row.score} | ${row.lastUpdate} |`);
  }
}

function outcomeReview() {
  const rows = readTracker();
  const withOutcome = rows.filter(r => r.outcome !== '—');
  if (withOutcome.length === 0) {
    console.log('No outcomes recorded yet. Record outcomes first with: node scripts/tracker.mjs outcome "Company" "Result"');
    return;
  }
  const counts = {};
  for (const row of withOutcome) {
    counts[row.outcome] = (counts[row.outcome] || 0) + 1;
  }
  const offers = withOutcome.filter(r => r.outcome === 'Offer Accepted' || r.outcome === 'Offer Received');
  const rejected = withOutcome.filter(r => r.outcome === 'Rejected' || r.outcome === 'Ghosted');
  console.log(`\n## Outcome Review (${withOutcome.length} applications)\n`);
  console.log('### Outcome Distribution');
  for (const [outcome, count] of Object.entries(counts)) {
    console.log(`- ${outcome}: ${count}`);
  }
  if (offers.length > 0) {
    console.log('\n### Success Patterns');
    for (const row of offers) {
      console.log(`- ${row.company} — ${row.role} (Score: ${row.score})`);
    }
  }
  if (rejected.length > 0) {
    console.log('\n### Rejection Patterns');
    const rejectedCompanies = rejected.map(r => r.company);
    console.log(`- Companies: ${rejectedCompanies.join(', ')}`);
    const rejectedRoles = rejected.map(r => r.role);
    console.log(`- Roles: ${[...new Set(rejectedRoles)].join(', ')}`);
  }
  console.log('\n### Suggestions');
  if (offers.length >= 2) {
    console.log('- You have multiple offers. Consider negotiating or declining politely.');
  }
  if (rejected.length >= 3) {
    console.log('- Multiple rejections detected. Consider reviewing your CV or lowering target seniority.');
  }
  const attentionCount = rows.filter(r => r.status === 'Attention').length;
  if (attentionCount > 0) {
    console.log(`- ${attentionCount} application(s) in attention queue need review before applying.`);
  }
}

function autonomyStatus() {
  const profile = loadActiveProfile();
  const level = getProfileAutonomyLevel(profile);
  console.log(`\nAutonomy level: ${level}`);
  console.log(`Source: ${profile.source}${profile.slug ? ` (${profile.slug})` : ''}`);
  if (level === 'review-each') {
    console.log('Behavior: All new applications go to Attention queue. You must approve each one before it moves to Saved/Applied.');
  } else if (level === 'routine-auto') {
    console.log('Behavior: Applications bypass Attention queue and go directly to Saved. Use with caution.');
  } else {
    console.log('Unknown level. Valid values: review-each, routine-auto');
  }
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
  const today = new Date().toISOString().split('T')[0];
  const dup = rows.find(r => r.company.toLowerCase() === company.toLowerCase() && r.role.toLowerCase() === role.toLowerCase());
  if (dup) {
    console.log(`Duplicate detected: ${company} — ${role} already exists (#${dup.num}, status: ${dup.status}). Skipping add.`);
    return;
  }
  const num = rows.length + 1;
  const autonomy = getProfileAutonomyLevel(loadActiveProfile());
  const initialStatus = autonomy === 'routine-auto' ? 'Saved' : 'Attention';
  rows.push({
    num: String(num),
    company,
    role,
    status: initialStatus,
    applied: '—',
    score: '—',
    lastUpdate: today,
    interviewStage: '—',
    outcome: '—',
    followupDate: '—',
    followupNote: '—',
  });
  writeTracker(rows);
  if (initialStatus === 'Attention') {
    console.log(`Added: ${company} — ${role} (Status: Attention — review required before applying)`);
  } else {
    console.log(`Added: ${company} — ${role} (Status: Saved)`);
  }
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
  case 'attention':
    listAttention();
    break;
  case 'review':
    outcomeReview();
    break;
  case 'autonomy':
    autonomyStatus();
    break;
  case 'reset':
    handleReset();
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
  console.log('  node scripts/tracker.mjs attention              — Show attention queue');
  console.log('  node scripts/tracker.mjs review                — Outcome review + suggestions');
  console.log('  node scripts/tracker.mjs autonomy              — Show autonomy level');
  console.log('  node scripts/tracker.mjs reset <mode>          — Reset tracker (profile|documents|all)');
}

function handleReset() {
  const mode = process.argv[3];
  if (!['profile', 'documents', 'all'].includes(mode)) {
    console.error('Invalid reset mode. Use: profile, documents, all');
    process.exit(1);
  }

  console.log(`\n⚠️  This will reset: ${mode}`);
  console.log('   - profile: clears all tracker rows (keeps header)');
  console.log('   - documents: deletes archived application folders under data/applications/');
  console.log('   - all: both of the above');
  console.log('\nType RESET to confirm:');

  process.stdin.setEncoding('utf8');
  process.stdin.once('data', (chunk) => {
    const answer = String(chunk).trim();
    if (answer !== 'RESET') {
      console.log('Aborted.');
      process.exit(0);
    }

    if (mode === 'profile' || mode === 'all') {
      const rows = readTracker();
      writeTracker([]);
      console.log('Tracker rows cleared.');
    }

    if (mode === 'documents' || mode === 'all') {
      const appsDir = resolve(ROOT, 'data/applications');
      if (existsSync(appsDir)) {
        for (const entry of readdirSync(appsDir)) {
          rmSync(resolve(appsDir, entry), { recursive: true, force: true });
        }
        console.log('Archived applications deleted.');
      }
    }

    console.log('Done.');
    process.exit(0);
  });
}
