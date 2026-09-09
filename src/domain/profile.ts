/**
 * domain/profile.ts — User profile types
 */

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

export interface Profile {
  candidate: Candidate;
  target_roles: string[];
  target_locations: string[];
  skills: ProfileSkills;
  experience?: ProfileExperience;
  outreach: OutreachConfig;
  preferences?: Record<string, unknown>;
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

export function getProfileSkills(profile: Profile): string {
  const skills = profile.skills;
  const cat = (...keys: (keyof ProfileSkills)[]): string[] =>
    keys.flatMap((k) => skills[k] || []).filter(Boolean);
  return cat("languages", "frameworks", "databases", "devops", "tools")
    .map(String)
    .join(", ");
}

export function getProfileTargetRoles(profile: Profile): string[] {
  return (profile.target_roles || [])
    .map((r) => String(r).trim())
    .filter(Boolean);
}

export function getProfileTargetLocations(profile: Profile): string[] {
  return (profile.target_locations || []).map(String).filter(Boolean);
}

export function getProfileExperience(profile: Profile): string {
  const exp = profile.experience || {};
  const yrs = exp.years ? ` (${exp.years} years)` : "";
  return `${exp.level || ""}${yrs}`.trim();
}

export function getProfileCandidate(profile: Profile): Candidate {
  return profile.candidate || { name: "" };
}
