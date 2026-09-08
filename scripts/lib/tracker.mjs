/**
 * lib/tracker.mjs — Shared application tracker reader
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const TRACKER_PATH = resolve(ROOT, 'data/applications.md');

export function ensureTracker() {
  const dir = resolve(ROOT, 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(TRACKER_PATH)) {
    writeFileSync(
      TRACKER_PATH,
      `# Application Tracker

| # | Company | Role | Status | Applied | Score | Last Update | Interview Stage | Outcome | Follow-up Date | Follow-up Note |
|---|---------|------|--------|---------|-------|-------------|-----------------|---------|----------------|----------------|
`,
    );
  }
}

export function readTracker() {
  ensureTracker();
  const content = readFileSync(TRACKER_PATH, 'utf-8');
  const rows = [];
  for (const line of content.split('\n')) {
    if (line.startsWith('|') && !line.startsWith('| #') && !line.startsWith('|---')) {
      const cols = line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
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

export function writeTracker(rows) {
  let content = `# Application Tracker\n\n| # | Company | Role | Status | Applied | Score | Last Update | Interview Stage | Outcome | Follow-up Date | Follow-up Note |\n|---|---------|------|--------|---------|-------|-------------|-----------------|---------|----------------|----------------|\n`;
  for (const row of rows) {
    content += `| ${row.num} | ${row.company} | ${row.role} | ${row.status} | ${row.applied} | ${row.score} | ${row.lastUpdate} | ${row.interviewStage} | ${row.outcome} | ${row.followupDate} | ${row.followupNote} |\n`;
  }
  writeFileSync(TRACKER_PATH, content);
}

export function findRow(rows, company) {
  return rows.find((r) => r.company.toLowerCase() === company.toLowerCase()) || null;
}

export function todayKey() {
  return new Date().toISOString().split('T')[0];
}
