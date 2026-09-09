/**
 * config/schemas.ts — Zod schemas for runtime validation
 *
 * TypeScript protects you during development.
 * Zod protects you when data comes from the outside world.
 */

import { z } from "zod";

// ─── Job Source ────────────────────────────────────────────────

export const JobSourceSchema = z.enum([
  "remoteok",
  "arbeitnow",
  "findwork",
  "remotive",
  "freehire",
  "greenhouse",
  "lever",
  "ashby",
  "linkedin",
  "wellfound",
  "manual",
]);

// ─── Compensation ──────────────────────────────────────────────

export const CompensationSchema = z.object({
  currency: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  period: z.enum(["hourly", "daily", "monthly", "yearly"]).optional(),
  raw: z.string().optional(),
});

// ─── Job Evaluation ────────────────────────────────────────────

export const JobEvaluationSchema = z.object({
  overall: z.number().min(0).max(5),
  roleFit: z.number().min(0).max(5),
  locationFit: z.number().min(0).max(5),
  growth: z.number().min(0).max(5),
  compensationFit: z.number().min(0).max(5),
  cultureFit: z.number().min(0).max(5),
  verdict: z.enum(["Strong Apply", "Review", "Maybe", "Skip"]),
  recommendation: z.string(),
  redFlags: z.array(z.string()),
});

// ─── Job (from sources) ────────────────────────────────────────

export const JobSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().optional(),
  url: z.string().url(),
  description: z.string().optional(),
  snippet: z.string().optional(),
  postedAt: z.string().optional(),
  source: JobSourceSchema,
  remote: z.boolean().optional().default(false),
  compensation: CompensationSchema.optional(),
  tags: z.array(z.string()).optional(),
  evaluation: JobEvaluationSchema.optional(),
});

export type JobInput = z.infer<typeof JobSchema>;

// ─── Profile ───────────────────────────────────────────────────

export const CandidateSchema = z.object({
  name: z.string(),
  email: z.string().email().optional(),
  github: z.string().url().optional(),
  linkedin: z.string().url().optional(),
  phone: z.string().optional(),
});

export const OutreachConfigSchema = z.object({
  short_dm: z.string().optional(),
  long_dm: z.string().optional(),
  linkedin_titles: z.array(z.string()).optional(),
});

export const ProfileSchema = z.object({
  candidate: CandidateSchema,
  targetRoles: z.array(z.string()),
  targetLocations: z.array(z.string()),
  skills: z.array(z.string()),
  experience: z.string().optional(),
  outreach: OutreachConfigSchema,
});

// ─── Application ───────────────────────────────────────────────

export const ApplicationStatusSchema = z.enum([
  "Applied",
  "Interviewing",
  "Offer Received",
  "Offer Accepted",
  "Offer Declined",
  "Rejected",
  "Ghosted",
  "Withdrawn",
]);

export const InterviewStageSchema = z.enum([
  "Phone Screen",
  "Technical",
  "Onsite",
  "Final Round",
  "HR Round",
  "Offer",
  "Other",
]);

export const InterviewSchema = z.object({
  stage: InterviewStageSchema,
  date: z.string().optional(),
  notes: z.string().optional(),
});

export const FollowUpSchema = z.object({
  date: z.string(),
  note: z.string(),
});

export const ApplicationSchema = z.object({
  company: z.string(),
  role: z.string(),
  status: ApplicationStatusSchema,
  appliedAt: z.string().optional(),
  interviews: z.array(InterviewSchema),
  followUps: z.array(FollowUpSchema),
  outcome: z.string().optional(),
  notes: z.string().optional(),
});

// ─── Validation helpers ────────────────────────────────────────

export function validateJob(data: unknown): JobInput {
  return JobSchema.parse(data);
}

export function validateJobSafe(data: unknown) {
  return JobSchema.safeParse(data);
}

export function validateProfile(data: unknown) {
  return ProfileSchema.parse(data);
}

export function validateApplication(data: unknown) {
  return ApplicationSchema.parse(data);
}
