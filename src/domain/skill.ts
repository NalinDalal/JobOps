/**
 * domain/skill.ts — Skill signal types
 */

export interface SkillSignal {
  skill: string;
  frequency: number;
  count: number;
  currentLevel: string;
  marketDemand: "High" | "Medium" | "Low";
}
