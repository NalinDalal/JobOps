/**
 * lib/constants.ts — Shared constants
 *
 * Score thresholds, default limits, and other configuration values.
 * No application logic here.
 */

// ─── Score thresholds ─────────────────────────────────────────

export const SCORE_STRONG = 4.0;
export const SCORE_REVIEW = 3.5;
export const SCORE_WEAK = 3.0;

/**
 * Score assigned to senior-level postings. The profile targets entry-level,
 * junior and early-career roles, so a senior posting is not a weak match to
 * review — it is out of scope.
 *
 * This must stay strictly below every `score_threshold` used for inclusion.
 * Capping at SCORE_REVIEW instead placed the job exactly on the digest
 * threshold, so it survived the `>= minScore` check and was emailed as a
 * "review" candidate.
 */
export const SCORE_SENIOR_EXCLUDED = 1.0;

// ─── Timeouts ─────────────────────────────────────────────────

export const FETCH_TIMEOUT_MS = 15000;
export const FETCH_TIMEOUT_SHORT_MS = 10000;

// ─── AI evaluation ────────────────────────────────────────────

/** Max Cloudflare AI requests in flight during a batch evaluation. */
export const AI_EVAL_CONCURRENCY = 3;

/**
 * Default number of jobs to send to the AI per digest run.
 *
 * Exceeding this is not fatal — the remainder fall back to keyword scoring —
 * but a keyword score can never reach SCORE_STRONG, so a job outside the AI
 * budget cannot be reported as a strong match. Raise it if the daily token
 * ceiling allows; override per run with `--evaluate N`.
 */
export const AI_EVAL_BUDGET = 25;

/**
 * Ceiling for a keyword-heuristic score.
 *
 * Deliberately below SCORE_STRONG: the heuristic is a prescreen for allocating
 * the AI budget, not a verdict, and must never outrank a real evaluation.
 */
export const HEURISTIC_MAX_SCORE = 3.9;

// ─── Truncation ───────────────────────────────────────────────

export const SNIPPET_MAX_LENGTH = 300;
export const TRUNCATE_DEFAULT = 200;
export const CV_TRUNCATE = 3000;
export const AI_RESPONSE_MAX = 4000;

// ─── Challenge goals ──────────────────────────────────────────

export const CHALLENGE_DAYS = 30;
export const CHALLENGE_TOTAL_GOAL = 300;
export const CHALLENGE_DAILY_GOAL = 10;

// ─── Funnel estimates ─────────────────────────────────────────

export const RESPONSE_RATE = 0.15;
export const INTERVIEW_RATE = 0.3;
export const OFFER_RATE = 0.3;

// ─── Follow-up ────────────────────────────────────────────────

export const FOLLOWUP_DEFAULT_DAYS = 7;
export const FOLLOWUP_MIN_DAYS = 4;
export const FOLLOWUP_MAX_DAYS = 7;

// ─── Experience filter ────────────────────────────────────────

export const MAX_EXPERIENCE_YEARS = 5;

// ─── Trust score thresholds ───────────────────────────────────

export const TRUST_HIGH = 80;
export const TRUST_MEDIUM = 60;
export const TRUST_LOW = 40;

// ─── User-Agent ───────────────────────────────────────────────

export const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

// ─── Date helpers ─────────────────────────────────────────────

export const IST_OFFSET_HOURS = 5.5;
export const MS_PER_HOUR = 3600;
export const MS_PER_DAY = 86400000;
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Get today's date as YYYY-MM-DD string
 */
export function todayKey(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
