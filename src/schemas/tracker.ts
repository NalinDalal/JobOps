/**
 * schemas/tracker.ts — Zod schema for tracker validation
 */

import { z } from "zod";

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

export type ApplicationInput = z.infer<typeof ApplicationSchema>;

export function validateApplication(data: unknown): ApplicationInput {
  return ApplicationSchema.parse(data);
}

export function validateApplicationSafe(data: unknown) {
  return ApplicationSchema.safeParse(data);
}
