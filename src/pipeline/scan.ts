/**
 * pipeline/scan.ts — Multi-portal job scanner
 *
 * Searches job boards and returns typed Job objects.
 * This is the entry point for the scanning pipeline.
 */

import type { Job, JobSource } from "../domain/job.js";
import { createJobId } from "../domain/job.js";
import { validateJobSafe } from "../config/schemas.js";
import { loadSearchConfig, loadPortalsConfig } from "../config/loader.js";
import { loadActiveProfile, getProfileTargetRoles } from "../lib/profile.js";
import { FETCH_TIMEOUT_MS, SNIPPET_MAX_LENGTH } from "../lib/constants.js";

// ─── Types ────────────────────────────────────────────────────

export interface ScanOptions {
  query?: string;
  location?: string;
  mock?: boolean;
}

export interface ScanResult {
  jobs: Job[];
  sources: string[];
  errors: string[];
}

// ─── Fetch helper ─────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  ms: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  return fetch(url, {
    ...opts,
    signal: AbortSignal.timeout(ms),
  });
}

// ─── Source adapters ──────────────────────────────────────────

async function scanRemoteOK(query: string, location: string): Promise<Job[]> {
  const jobs: Job[] = [];
  try {
    const res = await fetchWithTimeout("https://remoteok.com/api", {
      headers: { "User-Agent": "JobOps/1.0" },
    });
    if (!res.ok) return jobs;

    const data = (await res.json()) as Array<Record<string, unknown>>;
    for (const item of data) {
      if (!item.position || !item.company) continue;
      const job: Job = {
        id: "",
        title: String(item.position),
        company: String(item.company),
        location: String(item.location || "Remote"),
        url: item.apply ? String(item.apply) : `https://remoteok.com/remote-jobs/${item.id}`,
        description: String(item.description || ""),
        snippet: String(item.description || "").substring(0, SNIPPET_MAX_LENGTH),
        postedAt: item.date ? new Date(String(item.date)).toISOString().split("T")[0] : undefined,
        source: "remoteok",
        remote: true,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      };
      job.id = createJobId(job);
      jobs.push(job);
    }
  } catch (e) {
    console.warn(`RemoteOK scan failed: ${e}`);
  }
  return jobs;
}

async function scanArbeitnow(query: string, location: string): Promise<Job[]> {
  const jobs: Job[] = [];
  try {
    const res = await fetchWithTimeout("https://www.arbeitnow.com/api/job-board-api");
    if (!res.ok) return jobs;

    const data = (await res.json()) as { data?: Array<Record<string, unknown>> };
    for (const item of data.data || []) {
      const job: Job = {
        id: "",
        title: String(item.title || ""),
        company: String(item.company_name || ""),
        location: String(item.location || ""),
        url: String(item.url || ""),
        description: String(item.description || ""),
        snippet: String(item.description || "").substring(0, SNIPPET_MAX_LENGTH),
        postedAt: item.created_at ? new Date(String(item.created_at)).toISOString().split("T")[0] : undefined,
        source: "arbeitnow",
        remote: Boolean(item.remote),
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      };
      job.id = createJobId(job);
      jobs.push(job);
    }
  } catch (e) {
    console.warn(`Arbeitnow scan failed: ${e}`);
  }
  return jobs;
}

async function scanFindwork(query: string, location: string): Promise<Job[]> {
  const jobs: Job[] = [];
  try {
    const res = await fetchWithTimeout("https://findwork.dev/api/jobs/", {
      headers: { "User-Agent": "JobOps/1.0" },
    });
    if (!res.ok) return jobs;

    const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
    for (const item of data.results || []) {
      const job: Job = {
        id: "",
        title: String(item.role || ""),
        company: String(item.company_name || ""),
        location: String(item.location || ""),
        url: String(item.url || ""),
        description: String(item.text || ""),
        snippet: String(item.text || "").substring(0, SNIPPET_MAX_LENGTH),
        postedAt: item.date_posted ? new Date(String(item.date_posted)).toISOString().split("T")[0] : undefined,
        source: "findwork",
        remote: Boolean(item.remote),
        tags: Array.isArray(item.employment_type) ? [String(item.employment_type)] : [],
      };
      job.id = createJobId(job);
      jobs.push(job);
    }
  } catch (e) {
    console.warn(`Findwork scan failed: ${e}`);
  }
  return jobs;
}

async function scanRemotive(query: string, location: string): Promise<Job[]> {
  const jobs: Job[] = [];
  try {
    const res = await fetchWithTimeout("https://remotive.com/api/remote-jobs?limit=100");
    if (!res.ok) return jobs;

    const data = (await res.json()) as { jobs?: Array<Record<string, unknown>> };
    for (const item of data.jobs || []) {
      const job: Job = {
        id: "",
        title: String(item.title || ""),
        company: String(item.company_name || ""),
        location: String(item.candidate_required_location || ""),
        url: String(item.url || ""),
        description: String(item.description || ""),
        snippet: String(item.description || "").substring(0, SNIPPET_MAX_LENGTH),
        postedAt: item.publication_date ? new Date(String(item.publication_date)).toISOString().split("T")[0] : undefined,
        source: "remotive",
        remote: true,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      };
      job.id = createJobId(job);
      jobs.push(job);
    }
  } catch (e) {
    console.warn(`Remotive scan failed: ${e}`);
  }
  return jobs;
}

// ─── Main scan function ───────────────────────────────────────

export async function scanJobs(options: ScanOptions = {}): Promise<ScanResult> {
  const config = loadSearchConfig();
  const result: ScanResult = { jobs: [], sources: [], errors: [] };

  const query = options.query || config.custom_query || "software engineer";
  const location = options.location || "Remote";

  console.log(`Scanning with query="${query}" location="${location}"`);

  // Run all source scans in parallel
  const scans = [
    scanRemoteOK(query, location),
    scanArbeitnow(query, location),
    scanFindwork(query, location),
    scanRemotive(query, location),
  ];

  const results = await Promise.allSettled(scans);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const sourceName = ["remoteok", "arbeitnow", "findwork", "remotive"][i]!;

    if (r && r.status === "fulfilled") {
      result.jobs.push(...r.value);
      result.sources.push(sourceName);
    } else if (r && r.status === "rejected") {
      result.errors.push(`${sourceName}: ${r.reason}`);
    }
  }

  // Validate all jobs
  const validated: Job[] = [];
  for (const job of result.jobs) {
    const parsed = validateJobSafe(job);
    if (parsed.success) {
      validated.push(parsed.data as Job);
    }
  }

  result.jobs = validated;
  console.log(`Scanned ${result.jobs.length} jobs from ${result.sources.length} sources`);
  return result;
}

// ─── CLI entry point ──────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const mock = args.includes("--mock");
  const query = args.find((a) => !a.startsWith("--")) || "software engineer";

  const result = await scanJobs({ query, mock });
  console.log(JSON.stringify(result.jobs, null, 2));
}
