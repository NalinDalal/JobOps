/**
 * tracker/index.ts — Application tracker
 *
 * Manages data/applications.md with application statuses.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import type { Application, ApplicationStatus } from "../domain/application.js";
import { todayKey } from "../lib/constants.js";

const ROOT = resolve(import.meta.dir, "../..");
const TRACKER_PATH = resolve(ROOT, "data/applications.md");

// ─── Types ────────────────────────────────────────────────────

export interface TrackerRow {
  num: string;
  company: string;
  role: string;
  status: string;
  applied: string;
  score: string;
  lastUpdate: string;
  interviewStage: string;
  outcome: string;
  followupDate: string;
  followupNote: string;
}

// ─── File Operations ──────────────────────────────────────────

function ensureTracker(): void {
  const dir = resolve(ROOT, "data");
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

export function readTracker(): TrackerRow[] {
  ensureTracker();
  const content = readFileSync(TRACKER_PATH, "utf-8");
  const rows: TrackerRow[] = [];

  for (const line of content.split("\n")) {
    if (
      line.startsWith("|") &&
      !line.startsWith("| #") &&
      !line.startsWith("|---")
    ) {
      const cols = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);

      if (cols.length >= 4) {
        rows.push({
          num: cols[0] || "",
          company: cols[1] || "",
          role: cols[2] || "",
          status: cols[3] || "",
          applied: cols[4] || "—",
          score: cols[5] || "—",
          lastUpdate: cols[6] || "—",
          interviewStage: cols[7] || "—",
          outcome: cols[8] || "—",
          followupDate: cols[9] || "—",
          followupNote: cols[10] || "",
        });
      }
    }
  }

  return rows;
}

export function writeTracker(rows: TrackerRow[]): void {
  ensureTracker();

  const header = `# Application Tracker

| # | Company | Role | Status | Applied | Score | Last Update | Interview Stage | Outcome | Follow-up Date | Follow-up Note |
|---|---------|------|--------|---------|-------|-------------|-----------------|---------|----------------|----------------|`;

  const lines = rows.map(
    (r) =>
      `| ${r.num} | ${r.company} | ${r.role} | ${r.status} | ${r.applied} | ${r.score} | ${r.lastUpdate} | ${r.interviewStage} | ${r.outcome} | ${r.followupDate} | ${r.followupNote} |`
  );

  writeFileSync(TRACKER_PATH, [header, ...lines, ""].join("\n"));
}

export function findRow(rows: TrackerRow[], company: string): TrackerRow | undefined {
  return rows.find((r) => r.company.toLowerCase() === company.toLowerCase());
}

// ─── Commands ─────────────────────────────────────────────────

export function listApplications(): void {
  const rows = readTracker();
  if (rows.length === 0) {
    console.log("No applications tracked yet.");
    return;
  }

  console.log("\n## Application Tracker\n");
  console.log("| # | Company | Role | Status | Score | Interview | Outcome |");
  console.log("|---|---------|------|--------|-------|-----------|---------|");

  for (const row of rows) {
    console.log(
      `| ${row.num} | ${row.company} | ${row.role} | ${row.status} | ${row.score} | ${row.interviewStage} | ${row.outcome} |`
    );
  }

  // Summary
  const statuses: Record<string, number> = {};
  for (const row of rows) {
    statuses[row.status] = (statuses[row.status] || 0) + 1;
  }

  console.log("\n### Status Summary");
  for (const [status, count] of Object.entries(statuses)) {
    console.log(`- ${status}: ${count}`);
  }
}

export function addApplication(company: string, role: string): void {
  const rows = readTracker();
  const existing = findRow(rows, company);

  if (existing) {
    console.log(`Application for ${company} already exists.`);
    return;
  }

  const newNum = rows.length + 1;
  const newRow: TrackerRow = {
    num: String(newNum),
    company,
    role,
    status: "Saved",
    applied: todayKey(),
    score: "—",
    lastUpdate: todayKey(),
    interviewStage: "—",
    outcome: "—",
    followupDate: "—",
    followupNote: "",
  };

  rows.push(newRow);
  writeTracker(rows);
  console.log(`Added: ${company} — ${role}`);
}

export function updateStatus(company: string, status: string): void {
  const rows = readTracker();
  const row = findRow(rows, company);

  if (!row) {
    console.log(`No application found for ${company}.`);
    return;
  }

  row.status = status;
  row.lastUpdate = todayKey();
  writeTracker(rows);
  console.log(`Updated ${company}: ${status}`);
}

export function recordInterview(company: string, stage: string, date?: string): void {
  const rows = readTracker();
  const row = findRow(rows, company);

  if (!row) {
    console.log(`No application found for ${company}.`);
    return;
  }

  row.interviewStage = stage;
  row.status = "Interviewing";
  row.lastUpdate = todayKey();
  if (date) {
    row.followupDate = date;
  }

  writeTracker(rows);
  console.log(`Recorded interview for ${company}: ${stage}`);
}

export function recordOutcome(company: string, outcome: string): void {
  const rows = readTracker();
  const row = findRow(rows, company);

  if (!row) {
    console.log(`No application found for ${company}.`);
    return;
  }

  row.outcome = outcome;
  row.lastUpdate = todayKey();

  // Update status based on outcome
  if (outcome === "Offer Accepted") {
    row.status = "Offer";
  } else if (outcome === "Rejected" || outcome === "Ghosted") {
    row.status = "Rejected";
  } else if (outcome === "Withdrawn") {
    row.status = "Withdrawn";
  }

  writeTracker(rows);
  console.log(`Recorded outcome for ${company}: ${outcome}`);
}

export function addFollowup(company: string, note: string, date?: string): void {
  const rows = readTracker();
  const row = findRow(rows, company);

  if (!row) {
    console.log(`No application found for ${company}.`);
    return;
  }

  row.followupNote = note;
  row.followupDate = date || todayKey();
  row.lastUpdate = todayKey();

  writeTracker(rows);
  console.log(`Added follow-up for ${company}: ${note}`);
}

export function exportCsv(): void {
  const rows = readTracker();
  if (rows.length === 0) {
    console.log("No applications to export.");
    return;
  }

  const csvPath = resolve(ROOT, "data/tracker-export.csv");
  const header = "Company,Role,Status,Applied,Score,Last Update,Interview Stage,Outcome,Follow-up Date,Follow-up Note";
  const lines = rows.map(
    (r) =>
      `"${r.company}","${r.role}","${r.status}","${r.applied}","${r.score}","${r.lastUpdate}","${r.interviewStage}","${r.outcome}","${r.followupDate}","${r.followupNote}"`
  );

  writeFileSync(csvPath, [header, ...lines, ""].join("\n"));
  console.log(`Exported to ${csvPath}`);
}

// ─── CLI Entry ────────────────────────────────────────────────

export async function runTracker(args: Record<string, string | boolean>): Promise<void> {
  const command = String(args._ || "list");

  switch (command) {
    case "list":
      listApplications();
      break;
    case "add": {
      const company = String(args.company || args._2 || "");
      const role = String(args.role || args._3 || "");
      if (!company || !role) {
        console.error("Usage: tracker add --company <company> --role <role>");
        return;
      }
      addApplication(company, role);
      break;
    }
    case "update": {
      const company = String(args.company || "");
      const status = String(args.status || "");
      if (!company || !status) {
        console.error("Usage: tracker update --company <company> --status <status>");
        return;
      }
      updateStatus(company, status);
      break;
    }
    case "interview": {
      const company = String(args.company || "");
      const stage = String(args.stage || "");
      const date = args.date ? String(args.date) : undefined;
      if (!company || !stage) {
        console.error("Usage: tracker interview --company <company> --stage <stage>");
        return;
      }
      recordInterview(company, stage, date);
      break;
    }
    case "outcome": {
      const company = String(args.company || "");
      const outcome = String(args.outcome || "");
      if (!company || !outcome) {
        console.error("Usage: tracker outcome --company <company> --outcome <outcome>");
        return;
      }
      recordOutcome(company, outcome);
      break;
    }
    case "followup": {
      const company = String(args.company || "");
      const note = String(args.note || "");
      const date = args.date ? String(args.date) : undefined;
      if (!company || !note) {
        console.error("Usage: tracker followup --company <company> --note <note>");
        return;
      }
      addFollowup(company, note, date);
      break;
    }
    case "export":
      exportCsv();
      break;
    default:
      console.log("Available commands: list, add, update, interview, outcome, followup, export");
  }
}
