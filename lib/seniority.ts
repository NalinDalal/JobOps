/**
 * lib/seniority.ts — Senior-level role detection
 *
 * Single source of truth for deciding whether a posting is senior-level.
 * Consumed by `rank.ts` (exclusion), `digest.ts` (heuristic prescreen) and
 * `viewModel.ts` (outreach copy).
 *
 * This rule previously existed as three independent copies. Two of them matched
 * indicators with `String.includes()`, which is unsafe: the indicator "v"
 * matched "Vite", "Vercel" and "level", and "lead" matched "leadership". On a
 * real scan that misclassified ~23% of postings — including ordinary "Developer"
 * and "Developer Experience" roles — as senior, which both capped their scores
 * and rewrote generated outreach copy to claim a seniority mismatch that did
 * not exist.
 *
 * The profile targets entry-level, junior and early-career roles, so seniority
 * is an exclusion signal rather than a scoring dimension.
 */

/**
 * Years-of-experience requirements. Matches "5+ years", "5-7 yrs", "10 years"
 * and "10-15 years", but not "3 years" — a single digit must be 5 or above.
 */
const SENIOR_YEARS = /\b(?:[5-9]|\d{2})\s*(?:\+|-\s*\d+)?\s*(?:years?|yrs?)\b/;

/**
 * Applied to the job TITLE only.
 *
 * These must be word-boundary anchored. A bare substring match is unsafe:
 * the indicator "v" matches "Vite", "Vercel" and "level", and "lead" matches
 * "leadership" — so unrelated junior roles were being treated as senior.
 */
const SENIOR_TITLE_PATTERNS: readonly RegExp[] = [
    /\bsenior\b/,
    /\bsr\b\.?/,
    /\bstaff\b/,
    /\bprincipal\b/,
    /\blead\b/,
    /\bmanager\b/,
    /\bdirector\b/,
    /\bvp\b/,
    /\bvpe\b/,
    /\bhead of\b/,
    /\barchitect\b/,
    /\bfellow\b/,
    /\bdistinguished\b/,
    // Roman-numeral levels and band ladders, e.g. "Engineer III", "L5".
    /\b(?:iii|iv|v|vi|vii|viii|ix|x)\b/,
    /\bl[4-9]\b/,
    SENIOR_YEARS,
];

/**
 * Applied to title + snippet, where experience requirements actually live.
 * Deliberately excludes single generic words — "staff", "lead" and "manager"
 * are common nouns in description copy and would misfire on every posting.
 */
const SENIOR_DESC_PATTERNS: readonly RegExp[] = [SENIOR_YEARS];

/**
 * Whether a posting is senior-level (Senior/Staff/Principal, a management
 * title, a roman-numeral or band level, or an explicit multi-year requirement).
 */
export function isSeniorRole(title: string, snippet?: string): boolean {
    const t = title.toLowerCase();
    if (SENIOR_TITLE_PATTERNS.some((p) => p.test(t))) return true;
    const text = `${t} ${(snippet || "").toLowerCase()}`;
    return SENIOR_DESC_PATTERNS.some((p) => p.test(text));
}