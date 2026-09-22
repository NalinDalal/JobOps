/**
 * lib/types.ts — All domain types consolidated
 *
 * Single source of truth for all type definitions.
 */

// ─── Job types ───────────────────────────────────────────────────

export type JobSource =
  | "remoteok"
  | "arbeitnow"
  | "findwork"
  | "remotive"
  | "freehire"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "linkedin"
  | "wellfound"
  | "unknown";

export interface Compensation {
  currency?: string;
  min?: number;
  max?: number;
  period?: "hourly" | "daily" | "monthly" | "yearly";
  raw?: string;
}

export interface Job {
  id: string;
  source: JobSource;
  title: string;
  company: string;
  location?: string;
  url: string;
  description: string;
  snippet?: string;
  postedAt?: string;
  remote: boolean;
  compensation?: Compensation;
  tags?: string[];
  evaluation?: JobEvaluation;
}

export function createJobId(job: Pick<Job, "company" | "title" | "url">): string {
  return `${job.company}::${job.title}::${job.url}`;
}

// ─── Evaluation types ────────────────────────────────────────────

export type Verdict = "strong" | "review" | "maybe" | "skip";

export interface JobEvaluation {
  overall: number;
  roleFit: number;
  locationFit: number;
  growth: number;
  compensationFit: number;
  cultureFit: number;
  verdict: Verdict;
  recommendation: string;
  whyMatch: string[];
  matchedSkills: string[];
  redFlags: string[];
}

export function scoreToVerdict(score: number): Verdict {
  if (score >= 4.0) return "strong";
  if (score >= 3.5) return "review";
  if (score >= 3.0) return "maybe";
  return "skip";
}

export function verdictLabel(verdict: Verdict): string {
  switch (verdict) {
    case "strong":
      return "Strong Apply";
    case "review":
      return "Review";
    case "maybe":
      return "Maybe";
    case "skip":
      return "Skip";
  }
}

export function topLabel(score: number): string {
  if (score >= 4.0) return "Top match";
  return "Highest-ranked";
}

// ─── Profile types ───────────────────────────────────────────────

export interface Candidate {
  name: string;
  email?: string;
  github?: string;
  linkedin?: string;
  phone?: string;
}

export interface OutreachConfig {
  short_dm?: string;
  long_dm?: string;
  linkedin_titles?: string[];
}

export interface ProfileSkills {
  languages?: string[];
  frameworks?: string[];
  databases?: string[];
  devops?: string[];
  tools?: string[];
}

export interface ProfileExperience {
  level?: string;
  years?: number;
}

export interface Profile {
  candidate: Candidate;
  target_roles: string[];
  target_locations: string[];
  skills: ProfileSkills;
  experience?: ProfileExperience;
  outreach: OutreachConfig;
  preferences?: Record<string, unknown>;
  autonomy_level?: string;
}

// ─── Application tracker types ──────────────────────────────────

export type ApplicationStatus =
  | "Applied"
  | "Interviewing"
  | "Offer Received"
  | "Offer Accepted"
  | "Offer Declined"
  | "Rejected"
  | "Ghosted"
  | "Withdrawn";

export type InterviewStage =
  | "Phone Screen"
  | "Technical"
  | "Onsite"
  | "Final Round"
  | "HR Round"
  | "Offer"
  | "Other";

export interface Interview {
  stage: InterviewStage;
  date?: string;
  notes?: string;
}

export interface FollowUp {
  date: string;
  note: string;
}

export interface Application {
  company: string;
  role: string;
  status: ApplicationStatus;
  appliedAt?: string;
  interviews: Interview[];
  followUps: FollowUp[];
  outcome?: string;
  notes?: string;
}

// ─── Digest types ────────────────────────────────────────────────

export interface DigestViewModel {
  date: DigestDate;
  profile: DigestProfile;
  summary: DigestSummary;
  topMatches: DigestMatch[];
  actions: DigestAction[];
  peopleToContact: OutreachGroup[];
  skillGap: SkillSignal | null;
  acceleratorResearch: AcceleratorResearchSection | null;
  footer: DigestFooter;
}

export interface AcceleratorResearchSection {
  accelerators: Array<{
    name: string;
    batch: string;
    companies: Array<{
      name: string;
      url: string;
      careersUrl: string;
      techStack: string[];
      tags: string[];
    }>;
  }>;
  totalCompanies: number;
}

export interface DigestDate {
  full: string;
  long: string;
  short: string;
}

export interface DigestProfile {
  name: string;
  targetRoles: string[];
  targetLocations: string[];
}

export interface DigestSummary {
  totalScanned: number;
  freshCount: number;
  strongMatches: number;
  worthReviewing: number;
  newCompanies: number;
}

export interface DigestMatch {
  rank: number;
  company: string;
  title: string;
  location: string;
  posted: string;
  url: string;
  isRemote: boolean;
  compensation: string | undefined;
  score: MatchScore;
  verdict: string;
  label: string;
  whyMatch: string[];
  matchedSkills: string[];
  recommendation: string;
  redFlags: string[];
  snippet: string;
}

export interface MatchScore {
  overall: number;
  roleFit: number;
  location: number;
  growth: number;
  compensation: number;
  culture: number;
}

export interface DigestAction {
  label: string;
  url: string;
  reason: string;
}

export interface OutreachGroup {
  company: string;
  roles: string[];
  roleCount: number;
  peopleSearchUrls: PeopleSearchUrl[];
  outreachBlurb?: string;
}

export interface PeopleSearchUrl {
  title: string;
  url: string;
}

export interface SkillSignal {
  skill: string;
  frequency: number;
  count: number;
  currentLevel: string;
  marketDemand: "High" | "Medium" | "Low";
}

export interface DigestFooter {
  scanned: number;
  filtered: number;
  unscoredCount: number;
}

// ─── Research types ──────────────────────────────────────────────

export interface AcceleratorCompany {
  name: string;
  url: string;
  careersUrl: string;
  accelerator: string;
  batch: string;
  tags: string[];
  techStack: string[];
  description: string;
}

export interface AcceleratorResult {
  name: string;
  slug: string;
  batch: string;
  companies: AcceleratorCompany[];
  error?: string;
}

export interface ResearchResult {
  accelerators: AcceleratorResult[];
  totalCompanies: number;
  errors: string[];
  timestamp: string;
}

// ─── Outreach types ──────────────────────────────────────────────

export interface OutreachOptions {
  company: string;
  role?: string;
  companyUrl?: string;
  companyDescription?: string;
  techStack?: string[];
  accelerator?: string;
  format?: "short-dm" | "long-dm" | "email";
  output?: boolean;
}

export interface OutreachDraft {
  company: string;
  role: string;
  format: string;
  subject?: string;
  body: string;
  savedPath?: string;
}

// ─── Tailor types ────────────────────────────────────────────────

export interface TailorOptions {
  company: string;
  role: string;
  description?: string;
}

export interface TailorResult {
  cvPath: string;
  coverLetterPath: string;
}

// ─── Tracker types ───────────────────────────────────────────────

export interface TrackerRow {
  num: string;
  company: string;
  role: string;
  status: string;
  applied: string;
  score: string;
  lastUpdate: string;
  interviewStage: string;
  outcome: string;
  followupDate: string;
  followupNote: string;
}

// ─── Scan types ──────────────────────────────────────────────────

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

// ─── Rank types ──────────────────────────────────────────────────

export interface RankOptions {
  minScore?: number;
  maxJobs?: number;
}

export interface RankResult {
  strongMatches: Job[];
  worthReviewing: Job[];
  belowThreshold: Job[];
  unscored: Job[];
}

// ─── Dedup types ─────────────────────────────────────────────────

export interface DedupResult {
  unique: Job[];
  duplicates: number;
}

// ─── Config types ────────────────────────────────────────────────

export interface SearchConfigInput {
  include_titles: string[];
  exclude_titles: string[];
  locations: string[];
  allow_remote: boolean;
  max_age_days: number;
  score_threshold: number;
  max_per_digest: number;
  portals: {
    api_portals: boolean;
    greenhouse: boolean;
    lever: boolean;
    ashby: boolean;
    linkedin: boolean;
    instahyre: boolean;
    wellfound: boolean;
  };
  query_mode: "auto" | "custom";
  custom_query: string;
  mock_mode: boolean;
}

export interface PortalEntry {
  name: string;
  slug: string;
  url?: string;
  enabled?: boolean;
}

export interface PortalsConfigInput {
  greenhouse: PortalEntry[];
  lever: PortalEntry[];
  ashby: PortalEntry[];
  blacklist?: { enabled: boolean; companies: string[] };
  whitelist?: { enabled: boolean; companies: string[] };
  title_filter?: { positive: string[]; negative: string[] };
  search_queries?: Array<{ name: string; query: string; location: string; enabled: boolean }>;
}

// ─── Env types ───────────────────────────────────────────────────

export interface Env {
  cloudflareApiKey?: string;
  cloudflareAccountId?: string;
  cloudflareModel: string;
  resendApiKey?: string;
  mailFrom?: string;
  mailTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
}

// ─── Raw accelerator config ──────────────────────────────────────

export interface RawAccelerator {
  name: string;
  slug: string;
  enabled?: boolean;
  batch_urls: Array<{ url: string; batch: string; label: string }>;
  company_list_url: string;
  careers_pattern: string;
  tags?: string[];
}

export interface RawResearchConfig {
  accelerators: RawAccelerator[];
  research?: {
    max_companies_per_accelerator?: number;
    include_careers_urls?: boolean;
    include_tech_stack_hints?: boolean;
    output_dir?: string;
    outreach_dir?: string;
  };
}

// ─── Digest orchestration ────────────────────────────────────────

export interface DigestOptions {
  mode: string;
  query: string;
  max: number;
  evaluate: number;
  mock: boolean;
  research: boolean;
}

export interface DigestResult {
  scanned: number;
  fresh: number;
  digestJobs: number;
  unscored: number;
  researchCompanies: number;
  sent: boolean;
  provider?: "resend" | "smtp";
  mode: string;
}

export interface ViewModelOptions {
  dateStr?: string;
  totalScanned?: number;
  freshCount?: number;
  unscoredCount?: number;
  acceleratorResearch?: AcceleratorResearchSection | null;
}

// ─── Email ───────────────────────────────────────────────────────

export interface EmailOptions {
  subject: string;
  text: string;
  html: string;
}

export interface MailResult {
  sent: boolean;
  provider?: "resend" | "smtp";
}

// ─── AI types ────────────────────────────────────────────────────

export interface AIEvaluationPrompt {
  skills: string;
  targetRoles: string;
  targetLocations: string;
  experience: string;
  salary: string;
  job: {
    title: string;
    company: string;
    location: string;
    description: string;
  };
}

export interface AIEvaluationResult {
  overall: number;
  roleFit: number;
  locationFit: number;
  growth: number;
  compFit: number;
  cultureFit: number;
  entryLevelFit?: number;
  recommendation: string;
  redFlags: string[];
}