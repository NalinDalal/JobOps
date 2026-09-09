/**
 * schemas/profile.ts — Zod schema for profile validation
 */

import { z } from "zod";

export const CandidateSchema = z.object({
  name: z.string(),
  email: z.string().email().optional(),
  github: z.string().url().optional(),
  linkedin: z.string().url().optional(),
  phone: z.string().optional(),
});

export const ProfileSkillsSchema = z.object({
  languages: z.array(z.string()).optional(),
  frameworks: z.array(z.string()).optional(),
  databases: z.array(z.string()).optional(),
  devops: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
});

export const ProfileExperienceSchema = z.object({
  level: z.string().optional(),
  years: z.number().optional(),
});

export const OutreachConfigSchema = z.object({
  short_dm: z.string().optional(),
  long_dm: z.string().optional(),
  linkedin_titles: z.array(z.string()).optional(),
});

export const ProfileSchema = z.object({
  candidate: CandidateSchema,
  target_roles: z.array(z.string()),
  target_locations: z.array(z.string()),
  skills: ProfileSkillsSchema,
  experience: ProfileExperienceSchema.optional(),
  outreach: OutreachConfigSchema,
  preferences: z.record(z.unknown()).optional(),
});

export type ProfileInput = z.infer<typeof ProfileSchema>;

export function validateProfile(data: unknown): ProfileInput {
  return ProfileSchema.parse(data);
}

export function validateProfileSafe(data: unknown) {
  return ProfileSchema.safeParse(data);
}
