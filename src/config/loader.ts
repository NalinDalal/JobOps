/**
 * config/loader.ts — Configuration file loader
 *
 * Loads YAML configuration files and provides typed access.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { load as yamlLoad } from "js-yaml";
import type { SearchConfigInput, PortalsConfigInput } from "../schemas/config";
import type { Profile } from "../domain/profile";

const ROOT = resolve(import.meta.dir, "..", "..");

// ─── Default configurations ──────────────────────────────────

const DEFAULT_SEARCH_CONFIG: SearchConfigInput = {
    include_titles: ["Software Engineer", "Full Stack", "Backend", "Frontend"],
    exclude_titles: ["Senior", "Staff", "Principal", "Lead", "Manager"],
    locations: ["India", "Remote", "US", "United States"],
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

// ─── Loaders ──────────────────────────────────────────────────

function loadYaml<T>(path: string, defaults: T): T {
    try {
        if (!existsSync(path)) return defaults;
        const raw = yamlLoad(readFileSync(path, "utf-8"));
        return { ...defaults, ...(raw as object) } as T;
    } catch {
        return defaults;
    }
}

export function loadSearchConfig(): SearchConfigInput {
    return loadYaml(resolve(ROOT, "config/search.yml"), DEFAULT_SEARCH_CONFIG);
}

export function loadPortalsConfig(): PortalsConfigInput {
    return loadYaml(
        resolve(ROOT, "config/portals.yml"),
        DEFAULT_PORTALS_CONFIG,
    );
}

export function loadProfile(): Profile {
    return loadYaml(resolve(ROOT, "config/profile.yml"), {} as Profile);
}

export function loadProfilePreset(slug: string): Profile | null {
    const path = resolve(ROOT, "config/profiles", `${slug}.yaml`);
    if (!existsSync(path)) return null;
    return loadYaml(path, {} as Profile);
}

export function loadActiveProfile(): {
    source: "preset" | "fallback";
    slug: string | null;
    data: Profile;
} {
    const activePath = resolve(ROOT, "config/profiles", "active.json");
    try {
        if (existsSync(activePath)) {
            const raw = JSON.parse(readFileSync(activePath, "utf-8"));
            if (raw?.slug && typeof raw.slug === "string") {
                const preset = loadProfilePreset(raw.slug.trim());
                if (preset) {
                    return {
                        source: "preset",
                        slug: raw.slug.trim(),
                        data: preset,
                    };
                }
            }
        }
    } catch {
        // Fall through to fallback
    }
    return { source: "fallback", slug: null, data: loadProfile() };
}

export { ROOT };
