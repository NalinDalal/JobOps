/**
 * domain/digest.ts — Digest view model types
 *
 * This is the contract between the ViewModel builder and the Renderer.
 * Both sides must conform to these interfaces.
 */

export interface DigestViewModel {
  date: DigestDate;
  profile: DigestProfile;
  summary: DigestSummary;
  topMatches: DigestMatch[];
  actions: DigestAction[];
  peopleToContact: OutreachGroup[];
  skillGap: SkillSignal | null;
  footer: DigestFooter;
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
