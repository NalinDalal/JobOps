/**
 * lib/scan.ts — Multi-portal job scanner
 *
 * Searches job boards and returns typed Job objects.
 * This is the entry point for the scanning pipeline.
 */

import type { Job, JobSource, ScanOptions, ScanResult } from "./types";
import { createJobId } from "./types";
import { loadSearchConfig, loadPortalsConfig } from "./config";
import { FETCH_TIMEOUT_MS, SNIPPET_MAX_LENGTH } from "./constants";
import { normalizeLocation, stripHtml } from "./text";
import { z } from "zod";

function safePostedAt(raw: unknown): string | undefined {
  if (!raw) return undefined;
  try {
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString().split("T")[0];
  } catch {
    return undefined;
  }
}

const JobSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["remoteok", "arbeitnow", "findwork", "remotive", "freehire", "greenhouse", "lever", "ashby", "linkedin", "wellfound", "unknown"]),
  title: z.string().min(1),
  company: z.string().min(1),
  url: z.string().min(1),
  description: z.string(),
  remote: z.boolean(),
});

function isValidJob(j: Job): boolean {
  return JobSchema.safeParse(j).success;
}

// ─── Fetch helper ─────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  ms: number = FETCH_TIMEOUT_MS,
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
        location: normalizeLocation(String(item.location || "Remote")),
        url: item.apply
          ? String(item.apply)
          : `https://remoteok.com/remote-jobs/${item.id}`,
        description: String(item.description || ""),
        snippet: String(item.description || "").substring(
          0,
          SNIPPET_MAX_LENGTH,
        ),
        postedAt: safePostedAt(item.date),
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
    const res = await fetchWithTimeout(
      "https://www.arbeitnow.com/api/job-board-api",
    );
    if (!res.ok) return jobs;

    const data = (await res.json()) as {
      data?: Array<Record<string, unknown>>;
    };
    for (const item of data.data || []) {
      const job: Job = {
        id: "",
        title: String(item.title || ""),
        company: String(item.company_name || ""),
        location: normalizeLocation(String(item.location || "")),
        url: String(item.url || ""),
        description: String(item.description || ""),
        snippet: String(item.description || "").substring(
          0,
          SNIPPET_MAX_LENGTH,
        ),
        postedAt: safePostedAt(item.created_at),
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

    const data = (await res.json()) as {
      results?: Array<Record<string, unknown>>;
    };
    for (const item of data.results || []) {
      const job: Job = {
        id: "",
        title: String(item.role || ""),
        company: String(item.company_name || ""),
        location: normalizeLocation(String(item.location || "")),
        url: String(item.url || ""),
        description: String(item.text || ""),
        snippet: String(item.text || "").substring(0, SNIPPET_MAX_LENGTH),
        postedAt: safePostedAt(item.date_posted),
        source: "findwork",
        remote: Boolean(item.remote),
        tags: Array.isArray(item.employment_type)
          ? [String(item.employment_type)]
          : [],
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
    const res = await fetchWithTimeout(
      "https://remotive.com/api/remote-jobs?limit=100",
    );
    if (!res.ok) return jobs;

    const data = (await res.json()) as {
      jobs?: Array<Record<string, unknown>>;
    };
    for (const item of data.jobs || []) {
      const job: Job = {
        id: "",
        title: String(item.title || ""),
        company: String(item.company_name || ""),
        location: normalizeLocation(
          String(item.candidate_required_location || ""),
        ),
        url: String(item.url || ""),
        description: String(item.description || ""),
        snippet: String(item.description || "").substring(
          0,
          SNIPPET_MAX_LENGTH,
        ),
        postedAt: safePostedAt(item.publication_date),
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

async function scanFreehire(query: string, location: string): Promise<Job[]> {
  const jobs: Job[] = [];
  try {
    const res = await fetchWithTimeout("https://freehire.me/api/v1/jobs", {
      headers: { "User-Agent": "JobOps/1.0" },
    });
    if (!res.ok) return jobs;

    const data = (await res.json()) as {
      jobs?: Array<Record<string, unknown>>;
    };
    for (const item of data.jobs || []) {
      const job: Job = {
        id: "",
        title: String(item.title || ""),
        company: String(item.company || ""),
        location: normalizeLocation(String(item.location || "")),
        url: String(item.url || ""),
        description: String(item.description || ""),
        snippet: String(item.description || "").substring(
          0,
          SNIPPET_MAX_LENGTH,
        ),
        postedAt: safePostedAt(item.posted_at),
        source: "freehire",
        remote: Boolean(item.remote),
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      };
      job.id = createJobId(job);
      jobs.push(job);
    }
  } catch (e) {
    console.warn(`Freehire scan failed: ${e}`);
  }
  return jobs;
}

// ─── Greenhouse / Lever / Ashby scanners ──────────────────────

async function scanGreenhouse(query: string, location: string): Promise<Job[]> {
  const jobs: Job[] = [];
  const portalsConfig = loadPortalsConfig();

  for (const board of portalsConfig.greenhouse) {
    const slug = (board.slug || board.name).toLowerCase();
    try {
      const res = await fetchWithTimeout(
        `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
      );
      if (!res.ok) continue;

      const data = (await res.json()) as { jobs?: Array<Record<string, unknown>> };
      for (const item of data.jobs || []) {
        const job: Job = {
          id: "",
          title: String(item.title || ""),
          company: board.name,
          location: normalizeLocation(
            String((item.location as Record<string, unknown>)?.name || location),
          ),
          url: String(item.absolute_url || ""),
          description: String(item.content || ""),
          snippet: String(item.content || "").substring(0, SNIPPET_MAX_LENGTH),
          postedAt: safePostedAt(item.updated_at),
          source: "greenhouse",
          remote: Boolean(item.remote),
          tags: [],
        };
        job.id = createJobId(job);
        jobs.push(job);
      }
    } catch (e) {
      console.warn(`Greenhouse ${board.name} scan failed: ${e}`);
    }
  }
  return jobs;
}

async function scanLever(query: string, location: string): Promise<Job[]> {
  const jobs: Job[] = [];
  const portalsConfig = loadPortalsConfig();

  for (const board of portalsConfig.lever) {
    const slug = (board.slug || board.name).toLowerCase();
    try {
      const res = await fetchWithTimeout(
        `https://api.lever.co/v0/postings/${slug}?mode=json`,
      );
      if (!res.ok) continue;

      const data = (await res.json()) as Array<Record<string, unknown>>;
      for (const item of data) {
        const job: Job = {
          id: "",
          title: String(item.text || ""),
          company: board.name,
          location: normalizeLocation(
            String((item.categories as Record<string, unknown>)?.location || location),
          ),
          url: String(item.hostedUrl || ""),
          description: String(item.descriptionPlain || ""),
          snippet: String(item.descriptionPlain || "").substring(
            0,
            SNIPPET_MAX_LENGTH,
          ),
          postedAt: safePostedAt(item.createdAt),
          source: "lever",
          remote: String((item.categories as Record<string, unknown>)?.location || "")
            .toLowerCase()
            .includes("remote"),
          tags: [],
        };
        job.id = createJobId(job);
        jobs.push(job);
      }
    } catch (e) {
      console.warn(`Lever ${board.name} scan failed: ${e}`);
    }
  }
  return jobs;
}

async function scanAshby(query: string, location: string): Promise<Job[]> {
  const jobs: Job[] = [];
  const portalsConfig = loadPortalsConfig();

  for (const board of portalsConfig.ashby) {
    const slug = (board.slug || board.name).toLowerCase();
    try {
      const res = await fetchWithTimeout(
        `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) continue;

      const data = (await res.json()) as { jobs?: Array<Record<string, unknown>> };
      for (const item of data.jobs || []) {
        const job: Job = {
          id: "",
          title: String(item.title || ""),
          company: board.name,
          location: normalizeLocation(
            String(item.location || location),
          ),
          url: String(item.jobUrl || ""),
          description: String(item.descriptionHtml || ""),
          snippet: String(item.descriptionHtml || "").substring(
            0,
            SNIPPET_MAX_LENGTH,
          ),
          postedAt: safePostedAt(item.publishedAt),
          source: "ashby",
          remote: Boolean(item.isRemote),
          tags: [],
        };
        job.id = createJobId(job);
        jobs.push(job);
      }
    } catch (e) {
      console.warn(`Ashby ${board.name} scan failed: ${e}`);
    }
  }
  return jobs;
}


// ─── Filtering ────────────────────────────────────────────────

function matchesTitleFilters(job: Job, searchConfig: ReturnType<typeof loadSearchConfig>, portalsConfig: ReturnType<typeof loadPortalsConfig>): boolean {
  const title = job.title.toLowerCase();
  const desc = (job.description || job.snippet || "").toLowerCase();
  const haystack = `${title} ${desc}`;

  // portals.yml title_filter (positive = must match at least one if non-empty)
  const pos = portalsConfig.title_filter?.positive || [];
  const neg = portalsConfig.title_filter?.negative || [];
  if (pos.length > 0 && !pos.some((p) => haystack.includes(p.toLowerCase()))) return false;
  if (neg.some((n) => haystack.includes(n.toLowerCase()))) return false;

  // search.yml include/exclude
  if (searchConfig.include_titles.length > 0 && !searchConfig.include_titles.some((t) => haystack.includes(t.toLowerCase()))) return false;
  if (searchConfig.exclude_titles.some((t) => haystack.includes(t.toLowerCase()))) return false;

  return true;
}

function matchesCompanyFilters(job: Job, portalsConfig: ReturnType<typeof loadPortalsConfig>): boolean {
  const company = job.company.toLowerCase();
  const wl = portalsConfig.whitelist;
  const bl = portalsConfig.blacklist;
  if (wl?.enabled && wl.companies.length > 0) {
    return wl.companies.some((c) => company.includes(c.toLowerCase()));
  }
  if (bl?.enabled && bl.companies.length > 0) {
    if (bl.companies.some((c) => company.includes(c.toLowerCase()))) return false;
  }
  return true;
}

function matchesAgeFilter(job: Job, maxAgeDays: number): boolean {
  if (!maxAgeDays || maxAgeDays <= 0) return true;
  if (!job.postedAt) return true;
  const posted = new Date(job.postedAt).getTime();
  if (Number.isNaN(posted)) return true;
  const ageMs = Date.now() - posted;
  return ageMs <= maxAgeDays * 86400000;
}

function matchesQuery(job: Job, query: string): boolean {
  if (!query || query === "auto" || query === "software engineer") return true;
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = `${job.title} ${job.description || ""} ${job.snippet || ""} ${(job.tags || []).join(" ")}`.toLowerCase();
  return tokens.some((t) => hay.includes(t));
}

export function filterJobs(jobs: Job[], query: string): Job[] {
  const searchConfig = loadSearchConfig();
  const portalsConfig = loadPortalsConfig();
  return jobs.filter(
    (j) => matchesTitleFilters(j, searchConfig, portalsConfig) && matchesCompanyFilters(j, portalsConfig) && matchesAgeFilter(j, searchConfig.max_age_days) && matchesQuery(j, query),
  );
}

// ─── Main scan function ───────────────────────────────────────

export async function scanJobs(options: ScanOptions = {}): Promise<ScanResult> {
  const config = loadSearchConfig();
  const result: ScanResult = { jobs: [], sources: [], errors: [] };

  const query = options.query || config.custom_query || "software engineer";
  const location = options.location || "Remote";

  console.log(`Scanning with query="${query}" location="${location}"`);

  const scanFns: Array<() => Promise<Job[]>> = [];

  if (config.portals.api_portals) {
    scanFns.push(() => scanRemoteOK(query, location));
    scanFns.push(() => scanArbeitnow(query, location));
    scanFns.push(() => scanFindwork(query, location));
    scanFns.push(() => scanRemotive(query, location));
    scanFns.push(() => scanFreehire(query, location));
  }

  if (config.portals.greenhouse) {
    scanFns.push(() => scanGreenhouse(query, location));
  }
  if (config.portals.lever) {
    scanFns.push(() => scanLever(query, location));
  }
  if (config.portals.ashby) {
    scanFns.push(() => scanAshby(query, location));
  }

  const sourceNames: JobSource[] = [
    "remoteok",
    "arbeitnow",
    "findwork",
    "remotive",
    "freehire",
    "greenhouse",
    "lever",
    "ashby",
  ];

  const results = await Promise.allSettled(scanFns.map((fn) => fn()));

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const sourceName = sourceNames[i] || "unknown";

    if (r && r.status === "fulfilled") {
      result.jobs.push(...r.value);
      result.sources.push(sourceName);
    } else if (r && r.status === "rejected") {
      result.errors.push(`${sourceName}: ${r.reason}`);
    }
  }

  // contract validation — drop malformed API rows
  const preValidate = result.jobs.length;
  result.jobs = result.jobs.filter(isValidJob);
  if (preValidate !== result.jobs.length) console.log(`Dropped ${preValidate - result.jobs.length} invalid rows`);

  const preFilter = result.jobs.length;
  result.jobs = filterJobs(result.jobs, query);
  const filtered = preFilter - result.jobs.length;
  if (filtered > 0) console.log(`Filtered ${filtered} jobs by title/company/age/query`);

  console.log(
    `Scanned ${result.jobs.length} jobs from ${result.sources.length} sources`,
  );
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