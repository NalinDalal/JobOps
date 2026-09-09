/**
 * schemas/evaluation.ts — Zod schema for evaluation validation
 *
 * Validates AI responses and external evaluation data.
 */

import { z } from "zod";

export const VerdictSchema = z.enum(["strong", "review", "maybe", "skip"]);

export const JobEvaluationSchema = z.object({
  overall: z.number().min(0).max(5),
  roleFit: z.number().min(0).max(5),
  locationFit: z.number().min(0).max(5),
  growth: z.number().min(0).max(5),
  compensationFit: z.number().min(0).max(5),
  cultureFit: z.number().min(0).max(5),
  verdict: VerdictSchema,
  recommendation: z.string(),
  whyMatch: z.array(z.string()),
  matchedSkills: z.array(z.string()),
  redFlags: z.array(z.string()),
});

export type EvaluationInput = z.infer<typeof JobEvaluationSchema>;

export function validateEvaluation(data: unknown): EvaluationInput {
  return JobEvaluationSchema.parse(data);
}

export function validateEvaluationSafe(data: unknown) {
  return JobEvaluationSchema.safeParse(data);
}
