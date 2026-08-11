#!/usr/bin/env node

/**
 * html-report.mjs — Self-contained HTML dashboard
 * Generates an offline dashboard from tracker data and scan results.
 *
 * Usage: node scripts/html-report.mjs
 * Output: reports/tracker-dashboard.html
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function readTracker() {
  const trackerPath = resolve(ROOT, 'data/applications.md');
  if (!existsSync(trackerPath)) return [];

  const content = readFileSync(trackerPath, 'utf-8');
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

function readScans() {
  const reportsDir = resolve(ROOT, 'reports');
  if (!existsSync(reportsDir)) return [];

  const files = [];
  const entries = readFileSync(reportsDir, 'utf-8').split('\n');
  // Scan reports are markdown files starting with # Evaluation
  // This is a placeholder - actual scan data would come from scan results
  return files;
}

function generateSVGDashboard(rows) {
  const total = rows.length;
  const statuses = {};
  const outcomes = {};
  const interviews = rows.filter(r => r.interviewStage !== '—').length;
  const offers = rows.filter(r => r.outcome.includes('Offer')).length;

  for (const row of rows) {
    statuses[row.status] = (statuses[row.status] || 0) + 1;
    if (row.outcome !== '—') outcomes[row.outcome] = (outcomes[row.outcome] || 0) + 1;
  }

  const maxVal = Math.max(...Object.values(statuses), 1);

  function makeBar(label, value, max, color) {
    const height = Math.max((value / max) * 100, 2);
    return `<div style="display:flex;align-items:center;margin:6px 0;">
      <div style="width:120px;font-size:12px;color:#666;">${label}</div>
      <div style="flex:1;background:#f0f0f0;height:20px;border-radius:4px;overflow:hidden;">
        <div style="width:${height}%;background:${color};height:100%;border-radius:4px;transition:width 0.3s;"></div>
      </div>
      <div style="width:30px;text-align:right;font-size:12px;font-weight:bold;margin-left:8px;">${value}</div>
    </div>`;
  }

  const colors = {
    'Saved': '#1976d2',
    'Applied': '#f57c00',
    'Interviewing': '#7b1fa2',
    'Offer': '#388e3c',
    'Rejected': '#d32f2f',
    'Withdrawn': '#616161',
  };

  const statusBars = Object.entries(statuses)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => makeBar(label, value, maxVal, colors[label] || '#666'))
    .join('\n');

  return statusBars;
}

function main() {
  const rows = readTracker();
  const today = new Date().toISOString().split('T')[0];
  const upcomingFollowups = rows.filter(r => r.followupDate !== '—' && r.followupDate >= today);

  const total = rows.length;
  const interviews = rows.filter(r => r.interviewStage !== '—').length;
  const offers = rows.filter(r => r.outcome.includes('Offer')).length;
  const rejected = rows.filter(r => r.outcome === 'Rejected').length;
  const ghosted = rows.filter(r => r.outcome === 'Ghosted').length;

  const dashboardHTML = generateSVGDashboard(rows);

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
  .status { padding: 4px 8px; border-radius: 4px; font-size: 0.85em; font-weight: 500; display: inline-block; }
  .status-saved { background: #e3f2fd; color: #1976d2; }
  .status-applied { background: #fff3e0; color: #f57c00; }
  .status-interviewing { background: #f3e5f5; color: #7b1fa2; }
  .status-offer { background: #e8f5e9; color: #388e3c; }
  .status-rejected { background: #ffebee; color: #d32f2f; }
  .status-withdrawn { background: #f5f5f5; color: #616161; }
  .followup { color: #f57c00; font-weight: 500; }
  .filter-bar { margin-bottom: 15px; display: flex; gap: 10px; flex-wrap: wrap; }
  .filter-bar input { padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; }
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
        ${upcomingFollowups.map(r => `<tr><td><strong>${r.company}</strong></td><td>${r.role}</td><td>${r.followupDate}</td><td>${r.followupNote}</td></tr>`).join('\n')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="section">
    <h2>📋 All Applications</h2>
    <div class="filter-bar">
      <input type="text" id="searchInput" placeholder="🔍 Search by company or role..." onkeyup="filterTable()">
    </div>
    <table id="appsTable">
      <thead><tr><th>#</th><th>Company</th><th>Role</th><th>Status</th><th>Score</th><th>Interview Stage</th><th>Outcome</th><th>Follow-up</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td>${r.num}</td>
          <td><strong>${r.company}</strong></td>
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

  <div class="section">
    <h2>📈 Status Distribution</h2>
    <div id="dashboard">
      ${dashboardHTML}
    </div>
  </div>

  <div class="footer">
    Generated on ${new Date().toLocaleString()} by JobOps
  </div>
</div>

<script>
function filterTable() {
  const input = document.getElementById('searchInput');
  const filter = input.value.toLowerCase();
  const table = document.getElementById('appsTable');
  const tr = table.getElementsByTagName('tr');

  for (let i = 1; i < tr.length; i++) {
    const td = tr[i].getElementsByTagName('td');
    let show = false;
    for (let j = 0; j < td.length; j++) {
      if (td[j] && td[j].textContent.toLowerCase().indexOf(filter) > -1) {
        show = true;
        break;
      }
    }
    tr[i].style.display = show ? '' : 'none';
  }
}
</script>
</body>
</html>`;

  const reportPath = resolve(ROOT, 'reports/tracker-dashboard.html');
  if (!existsSync(resolve(ROOT, 'reports'))) mkdirSync(resolve(ROOT, 'reports'), { recursive: true });
  writeFileSync(reportPath, html);
  console.log(`Dashboard saved to: ${reportPath}`);
  console.log(`Open in browser: file://${reportPath}`);
}

main();
