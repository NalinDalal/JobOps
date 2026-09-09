/**
 * lib/text.ts — Text processing utilities
 */

import { TRUNCATE_DEFAULT } from "./constants.js";

export function stripHtml(s: string | undefined | null): string {
  return String(s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(s: string | undefined | null, maxLen: number = TRUNCATE_DEFAULT): string {
  const clean = stripHtml(s);
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

export function escapeHtml(s: string | undefined | null): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const COUNTRY_SUFFIXES = [
  ", United States",
  ", USA",
  ", US",
  ", United Kingdom",
  ", UK",
  ", India",
  ", Germany",
  ", France",
  ", Canada",
  ", Australia",
];

export function normalizeLocation(loc: string | undefined | null): string {
  if (!loc) return "Remote";
  let clean = String(loc).trim();

  // Strip "Posted YYYY-MM-DD" if attached
  clean = clean.replace(/\s*·?\s*Posted\s+\d{4}-\d{2}-\d{2}.*$/i, "").trim();

  // If it contains " · ", split and take first two meaningful parts
  if (clean.includes(" · ")) {
    const parts = clean
      .split(" · ")
      .map((p) => p.trim())
      .filter(Boolean);
    // Deduplicate
    const unique = [...new Set(parts)];
    // Take at most 2 locations, strip country suffixes
    clean = unique
      .slice(0, 2)
      .map((p) => {
        for (const suffix of COUNTRY_SUFFIXES) {
          if (p.endsWith(suffix)) return p.slice(0, -suffix.length);
        }
        return p;
      })
      .join(" / ");
  }

  // Strip trailing country suffixes
  for (const suffix of COUNTRY_SUFFIXES) {
    if (clean.endsWith(suffix)) {
      clean = clean.slice(0, -suffix.length);
      break;
    }
  }

  return clean || "Remote";
}
