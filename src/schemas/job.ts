/**
 * schemas/job.ts — Zod schema for job validation
 *
 * Used at external boundaries (API responses, file input) to validate
 * that incoming data conforms to our domain types.
 */

import { z } from "zod";

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
  "unknown",
]);

export const CompensationSchema = z.object({
  currency: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  period: z.enum(["hourly", "daily", "monthly", "yearly"]).optional(),
  raw: z.string().optional(),
});

export const JobSchema = z.object({
  id: z.string(),
  source: JobSourceSchema,
  title: z.string(),
  company: z.string(),
  location: z.string().optional(),
  url: z.string(),
  description: z.string(),
  postedAt: z.string().optional(),
  remote: z.boolean(),
  compensation: CompensationSchema.optional(),
  tags: z.array(z.string()).optional(),
});

export type JobInput = z.infer<typeof JobSchema>;

export function validateJob(data: unknown): JobInput {
  return JobSchema.parse(data);
}

export function validateJobSafe(data: unknown) {
  return JobSchema.safeParse(data);
}
