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
  const rows = readTracker();

  const total = rows.length;
  const statuses = {};
  const outcomes = {};
  const sources = {};
  const interviews = rows.filter(r => r.interviewStage !== '—').length;
  const offers = rows.filter(r => r.outcome.includes('Offer')).length;
  const rejected = rows.filter(r => r.outcome === 'Rejected').length;
  const ghosted = rows.filter(r => r.outcome === 'Ghosted').length;

  for (const row of rows) {
    statuses[row.status] = (statuses[row.status] || 0) + 1;
    if (row.outcome !== '—') outcomes[row.outcome] = (outcomes[row.outcome] || 0) + 1;
  }

  const today = new Date().toISOString().split('T')[0];
  const upcomingFollowups = rows.filter(r => r.followupDate !== '—' && r.followupDate >= today);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>JobOps Tracker Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 20px; }
  .container { max-width: 1400px; margin: 0 auto; }
  h1 { margin-bottom: 20px; color: #1a1a2e; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
  .stat-card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; }
  .stat-value { font-size: 2.5em; font-weight: bold; color: #1a1a2e; }
  .stat-label { color: #666; margin-top: 5px; font-size: 0.9em; }
  .section { background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .section h2 { margin-bottom: 15px; color: #1a1a2e; font-size: 1.2em; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
  th { font-weight: 600; color: #666; font-size: 0.85em; text-transform: uppercase; }
  tr:hover { background: #f9f9f9; }
  .status { padding: 4px 8px; border-radius: 4px; font-size: 0.85em; font-weight: 500; }
  .status-saved { background: #e3f2fd; color: #1976d2; }
  .status-applied { background: #fff3e0; color: #f57c00; }
  .status-interviewing { background: #f3e5f5; color: #7b1fa2; }
  .status-offer { background: #e8f5e9; color: #388e3c; }
  .status-rejected { background: #ffebee; color: #d32f2f; }
  .status-withdrawn { background: #f5f5f5; color: #616161; }
  .followup { color: #f57c00; font-weight: 500; }
  .footer { text-align: center; margin-top: 30px; color: #999; font-size: 0.85em; }
</style>
</head>
<body>
<div class="container">
  <h1>📊 JobOps Tracker Dashboard</h1>

  <div class="stats">
    <div class="stat-card">
      <div class="stat-value">${total}</div>
      <div class="stat-label">Total Applications</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${interviews}</div>
      <div class="stat-label">Interviews</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${offers}</div>
      <div class="stat-label">Offers</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${rejected}</div>
      <div class="stat-label">Rejected</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${ghosted}</div>
      <div class="stat-label">Ghosted</div>
    </div>
  </div>

  ${upcomingFollowups.length > 0 ? `
  <div class="section">
    <h2>⏰ Upcoming Follow-ups</h2>
    <table>
      <thead><tr><th>Company</th><th>Role</th><th>Follow-up Date</th><th>Note</th></tr></thead>
      <tbody>
        ${upcomingFollowups.map(r => `<tr><td>${r.company}</td><td>${r.role}</td><td>${r.followupDate}</td><td>${r.followupNote}</td></tr>`).join('\n')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="section">
    <h2>📋 All Applications</h2>
    <table>
      <thead><tr><th>#</th><th>Company</th><th>Role</th><th>Status</th><th>Score</th><th>Interview Stage</th><th>Outcome</th><th>Follow-up</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td>${r.num}</td>
          <td>${r.company}</td>
          <td>${r.role}</td>
          <td><span class="status status-${r.status.toLowerCase()}">${r.status}</span></td>
          <td>${r.score}</td>
          <td>${r.interviewStage}</td>
          <td>${r.outcome}</td>
          <td>${r.followupDate !== '—' ? `<span class="followup">${r.followupDate}</span>` : '—'}</td>
        </tr>`).join('\n')}
      </tbody>
    </table>
  </div>

  <div class="footer">
    Generated on ${new Date().toLocaleString()} by JobOps
  </div>
</div>
</body>
</html>`;

  const reportPath = resolve(ROOT, 'reports/tracker-dashboard.html');
  if (!existsSync(resolve(ROOT, 'reports'))) mkdirSync(resolve(ROOT, 'reports'), { recursive: true });
  writeFileSync(reportPath, html);
  console.log(`Dashboard saved to: ${reportPath}`);
  console.log(`Open in browser: file://${reportPath}`);
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
