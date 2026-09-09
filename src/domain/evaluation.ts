/**
 * domain/evaluation.ts — Job evaluation types
 *
 * 5-dimension scoring system for job fit analysis.
 */

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
    case "strong": return "Strong Apply";
    case "review": return "Review";
    case "maybe": return "Maybe";
    case "skip": return "Skip";
  }
}

export function topLabel(score: number): string {
  if (score >= 4.0) return "Top match";
  return "Highest-ranked";
}
