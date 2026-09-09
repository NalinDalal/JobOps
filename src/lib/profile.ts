/**
 * lib/profile.ts — Shared profile loader for JobOps
 *
 * Loads the active profile from config/profiles/active.json,
 * falling back to config/profile.yml if no active preset is set.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { load as yamlLoad } from "js-yaml";
import type { Profile, Candidate, OutreachConfig } from "../domain/profile";

// ─── Paths ────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dir, "..", "..");
const PROFILES_DIR = resolve(ROOT, "config/profiles");
const ACTIVE_PATH = resolve(PROFILES_DIR, "active.json");
const FALLBACK_PATH = resolve(ROOT, "config/profile.yml");

// ─── Types ────────────────────────────────────────────────────

interface ProfileData {
    candidate?: Candidate;
    target_roles?: string[];
    target_locations?: string[];
    skills?: Record<string, string[]>;
    experience?: { level?: string; years?: number };
    outreach?: OutreachConfig;
    preferences?: Record<string, unknown>;
    autonomy_level?: string;
}

interface LoadedProfile {
    source: "preset" | "fallback";
    slug: string | null;
    data: ProfileData;
}

// ─── Helpers ──────────────────────────────────────────────────

function loadYaml(path: string): ProfileData {
    try {
        if (!existsSync(path)) return {};
        return (yamlLoad(readFileSync(path, "utf-8")) as ProfileData) || {};
    } catch {
        return {};
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

// ─── Public API ───────────────────────────────────────────────

export function loadActiveProfile(): LoadedProfile {
    const slug = loadActiveSlug();
    if (slug) {
        const presetPath = resolve(PROFILES_DIR, `${slug}.yaml`);
        if (existsSync(presetPath)) {
            return { source: "preset", slug, data: loadYaml(presetPath) };
        }
    }
    const fallback = loadYaml(FALLBACK_PATH);
    return { source: "fallback", slug: null, data: fallback };
}

export function getProfileSkills(profile: LoadedProfile): string {
    const data = profile.data;
    const skills = data.skills || {};
    const cat = (...keys: string[]): string[] =>
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
