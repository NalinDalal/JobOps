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
import { normalizeLocation } from "./text";

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
        postedAt: item.date
          ? new Date(String(item.date)).toISOString().split("T")[0]
          : undefined,
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
        postedAt: item.created_at
          ? new Date(String(item.created_at))
                .toISOString()
                .split("T")[0]
          : undefined,
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
        postedAt: item.date_posted
          ? new Date(String(item.date_posted))
                .toISOString()
                .split("T")[0]
          : undefined,
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
        postedAt: item.publication_date
          ? new Date(String(item.publication_date))
                .toISOString()
                .split("T")[0]
          : undefined,
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
        postedAt: item.posted_at
          ? new Date(String(item.posted_at))
                .toISOString()
                .split("T")[0]
          : undefined,
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
    try {
      const res = await fetchWithTimeout(
        `https://boards-api.greenhouse.io/v1/boards/${board.name}/jobs`,
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
          postedAt: item.updated_at
            ? new Date(String(item.updated_at))
                  .toISOString()
                  .split("T")[0]
            : undefined,
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
    try {
      const res = await fetchWithTimeout(
        `https://api.lever.co/v0/postings/${board.name}?mode=json`,
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
          postedAt: item.createdAt
            ? new Date(String(item.createdAt))
                  .toISOString()
                  .split("T")[0]
            : undefined,
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
    try {
      const res = await fetchWithTimeout(
        `https://api.ashbyhq.com/posting-api/job-board/${board.name}?includeCompensation=true`,
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
          postedAt: item.publishedAt
            ? new Date(String(item.publishedAt))
                  .toISOString()
                  .split("T")[0]
            : undefined,
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