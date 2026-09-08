/**
 * lib/constants.mjs — Shared constants across JobOps scripts
 */

// ─── Score thresholds ─────────────────────────────────────────
export const SCORE_STRONG = 4.0;
export const SCORE_REVIEW = 3.5;
export const SCORE_WEAK = 3.0;

// ─── Timeouts ─────────────────────────────────────────────────
export const FETCH_TIMEOUT_MS = 15000;
export const FETCH_TIMEOUT_SHORT_MS = 10000;

// ─── Snippet / truncation ─────────────────────────────────────
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

// ─── Trust score thresholds (verifyJob) ──────────────────────
export const TRUST_HIGH = 80;
export const TRUST_MEDIUM = 60;
export const TRUST_LOW = 40;

// ─── User-Agent string ───────────────────────────────────────
export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

// ─── Date helpers ─────────────────────────────────────────────
export const IST_OFFSET_HOURS = 5.5;
export const MS_PER_HOUR = 3600;
export const MS_PER_DAY = 86400000;
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
