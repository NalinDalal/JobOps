/**
 * lib/config.ts — Unified configuration loader
 *
 * Merges: env loading, YAML config loading, profile loading
 * Single entry point for all configuration.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { load as yamlLoad } from "js-yaml";
import type {
  Env,
  SearchConfigInput,
  PortalsConfigInput,
  Profile,
  ProfileSkills,
  ProfileExperience,
  Candidate,
  OutreachConfig,
} from "./types";

const ROOT = resolve(import.meta.dir, "..");
const PROFILES_DIR = resolve(ROOT, "config/profiles");
const ACTIVE_PATH = resolve(PROFILES_DIR, "active.json");
const FALLBACK_PROFILE_PATH = resolve(ROOT, "config/profile.yml");
const SEARCH_CONFIG_PATH = resolve(ROOT, "config/search.yml");
const PORTALS_CONFIG_PATH = resolve(ROOT, "config/portals.yml");
const ACCELERATORS_PATH = resolve(ROOT, "config/accelerators.yml");

// ─── Default configurations ────────────────────────────────────

const DEFAULT_SEARCH_CONFIG: SearchConfigInput = {
  include_titles: [
    "Software Engineer",
    "Full Stack",
    "Backend",
    "Frontend",
    "SWE",
    "Developer",
    "Junior",
    "Entry Level",
    "Graduate",
  ],
  exclude_titles: [
    "Senior",
    "Staff",
    "Principal",
    "Lead",
    "Manager",
    "Director",
    "VP",
    "Vice President",
    "Head of",
    "Architect",
    "Fellow",
    "Distinguished",
    "Intern",
    "Internship",
    "Co-op",
    "Contract",
    "Freelance",
    "Part-time",
    " III",
    " IV",
    " V",
    " VI",
    " VII",
    " VIII",
    "5+ years",
    "6+ years",
    "7+ years",
    "8+ years",
    "9+ years",
    "10+ years",
    "12+ years",
    "15+ years",
  ],
  locations: [
    "India",
    "Remote",
    "US",
    "United States",
    "Europe",
    "Canada",
    "UK",
    "London",
    "Netherlands",
    "Amsterdam",
    "Singapore",
    "Australia",
    "Dubai",
    "Bangalore",
    "Bengaluru",
    "Mumbai",
    "Delhi",
    "Hyderabad",
    "Pune",
    "Chennai",
  ],
  allow_remote: true,
  max_age_days: 30,
  score_threshold: 3.5,
  max_per_digest: 10,
  portals: {
    api_portals: true,
    greenhouse: true,
    lever: true,
    ashby: true,
    linkedin: true,
    instahyre: true,
    wellfound: true,
  },
  query_mode: "auto",
  custom_query: "",
  mock_mode: false,
};

const DEFAULT_PORTALS_CONFIG: PortalsConfigInput = {
  greenhouse: [],
  lever: [],
  ashby: [],
};

const DEFAULT_ENV: Env = {
  cloudflareModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
};

// ─── YAML Loader ───────────────────────────────────────────────

function loadYaml<T>(path: string, defaults: T): T {
  try {
    if (!existsSync(path)) return defaults;
    const raw = yamlLoad(readFileSync(path, "utf-8"));
    return { ...defaults, ...(raw as object) } as T;
  } catch {
    return defaults;
  }
}

// ─── Env Loader ────────────────────────────────────────────────

let cachedEnv: Env | undefined;

export function loadEnv(root?: string): Env {
  if (cachedEnv) return cachedEnv;

  const rootDir = root || ROOT;
  const envPath = resolve(rootDir, ".env");

  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (let rawLine of lines) {
      let line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.startsWith("export ")) line = line.slice(7).trim();
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      let key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      // strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      } else {
        // strip trailing inline comment (unquoted #)
        const hash = val.indexOf(" #");
        if (hash !== -1) val = val.slice(0, hash).trim();
      }
      if (key) process.env[key] = val;
    }
  }

  cachedEnv = {
    cloudflareApiKey:
      process.env.CLOUDFLARE_API_KEY || process.env.CLOUDFLARE_API_TOKEN,
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareModel: process.env.CLOUDFLARE_MODEL || DEFAULT_ENV.cloudflareModel,
    resendApiKey: process.env.RESEND_API_KEY,
    mailFrom: process.env.MAIL_FROM,
    mailTo: process.env.MAIL_TO,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT
      ? parseInt(process.env.SMTP_PORT, 10)
      : undefined,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
  };

  return cachedEnv;
}

export function hasCloudflareKeys(env: Env): boolean {
  return Boolean(env.cloudflareApiKey && env.cloudflareAccountId);
}

export function hasEmailConfig(env: Env): boolean {
  return Boolean(env.resendApiKey) || Boolean(env.smtpUser && env.smtpPass);
}


// ─── Config Loaders ────────────────────────────────────────────

export function loadSearchConfig(): SearchConfigInput {
  return loadYaml(SEARCH_CONFIG_PATH, DEFAULT_SEARCH_CONFIG);
}

export function loadPortalsConfig(): PortalsConfigInput {
  const raw = loadYaml(PORTALS_CONFIG_PATH, {} as Record<string, unknown>) as Record<string, unknown>;
  const pickBoards = (key: string): import("./types").PortalEntry[] => {
    const v = raw[key] as { boards?: import("./types").PortalEntry[] } | import("./types").PortalEntry[] | undefined;
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (v.boards && Array.isArray(v.boards)) return v.boards;
    return [];
  };
  return {
    greenhouse: pickBoards("greenhouse"),
    lever: pickBoards("lever"),
    ashby: pickBoards("ashby"),
    blacklist: (raw.blacklist as PortalsConfigInput["blacklist"]) || undefined,
    whitelist: (raw.whitelist as PortalsConfigInput["whitelist"]) || undefined,
    title_filter: (raw.title_filter as PortalsConfigInput["title_filter"]) || undefined,
    search_queries: (raw.search_queries as PortalsConfigInput["search_queries"]) || undefined,
  };
}

export function loadAcceleratorsConfig(): { accelerators: RawAccelerator[] } {
  return loadYaml(ACCELERATORS_PATH, { accelerators: [] });
}

interface RawAccelerator {
  name: string;
  slug: string;
  enabled?: boolean;
  batch_urls: Array<{ url: string; batch: string; label: string }>;
  company_list_url: string;
  careers_pattern: string;
  tags?: string[];
}

// ─── Profile Loader ────────────────────────────────────────────

function loadYamlProfile(path: string): Profile {
  try {
    if (!existsSync(path)) return {} as Profile;
    return (yamlLoad(readFileSync(path, "utf-8")) as Profile) || ({} as Profile);
  } catch {
    return {} as Profile;
  }
}

function loadActiveSlug(): string | null {
  try {
    if (existsSync(ACTIVE_PATH)) {
      const raw = readFileSync(ACTIVE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed?.slug && typeof parsed.slug === "string")
        return parsed.slug.trim();
    }
  } catch {
    // Silently return null if active profile can't be loaded
  }
  return null;
}

export interface LoadedProfile {
  source: "preset" | "fallback";
  slug: string | null;
  data: Profile;
}

export function loadActiveProfile(): LoadedProfile {
  const slug = loadActiveSlug();
  if (slug) {
    const presetPath = resolve(PROFILES_DIR, `${slug}.yaml`);
    if (existsSync(presetPath)) {
      return { source: "preset", slug, data: loadYamlProfile(presetPath) };
    }
  }
  const fallback = loadYamlProfile(FALLBACK_PROFILE_PATH);
  return { source: "fallback", slug: null, data: fallback };
}

// ─── Profile Helpers ───────────────────────────────────────────

export function getProfileSkills(profile: LoadedProfile): string {
  const data = profile.data;
  const skills = data.skills || {};
  const cat = (...keys: (keyof ProfileSkills)[]): string[] =>
    keys.flatMap((k) => skills[k] || []).filter(Boolean);
  return cat("languages", "frameworks", "databases", "devops", "tools")
    .map(String)
    .join(", ");
}

export function getProfileTargetRoles(profile: LoadedProfile): string[] {
  return (profile.data.target_roles || [])
    .map((r) => String(r).trim())
    .filter(Boolean);
}

export function getProfileTargetLocations(profile: LoadedProfile): string[] {
  return (profile.data.target_locations || []).map(String).filter(Boolean);
}

export function getProfileExperience(profile: LoadedProfile): string {
  const exp = profile.data.experience || {};
  const yrs = exp.years ? ` (${exp.years} years)` : "";
  return `${exp.level || ""}${yrs}`.trim();
}

export function getProfileCandidate(profile: LoadedProfile): Candidate {
  return profile.data.candidate || { name: "" };
}

export function getProfilePreferences(
  profile: LoadedProfile,
): Record<string, unknown> {
  return profile.data.preferences || {};
}

export function getProfileOutreach(profile: LoadedProfile): OutreachConfig {
  return profile.data.outreach || {};
}

export function getProfileAutonomyLevel(profile: LoadedProfile): string {
  return profile.data.autonomy_level || "review-each";
}

export function getActiveProfileSlug(): string | null {
  return loadActiveSlug();
}

export function setActiveProfile(slug: string): void {
  mkdirSync(resolve(ROOT, "config/profiles"), { recursive: true });
  writeFileSync(ACTIVE_PATH, JSON.stringify({ slug }, null, 2));
}

export { ROOT };