/**
 * domain/index.ts — Export all domain types
 */

export type { Job, JobSource, Compensation } from "./job.js";
export { createJobId } from "./job.js";

export type { JobEvaluation, Verdict } from "./evaluation.js";
export { scoreToVerdict, verdictLabel, topLabel } from "./evaluation.js";

export type {
  Profile,
  Candidate,
  ProfileSkills,
  ProfileExperience,
  OutreachConfig,
} from "./profile.js";
export {
  getProfileSkills,
  getProfileTargetRoles,
  getProfileTargetLocations,
  getProfileExperience,
  getProfileCandidate,
} from "./profile.js";

export type {
  Application,
  ApplicationStatus,
  InterviewStage,
  Interview,
  FollowUp,
} from "./application.js";

export type {
  DigestViewModel,
  DigestDate,
  DigestProfile,
  DigestSummary,
  DigestMatch,
  MatchScore,
  DigestAction,
  OutreachGroup,
  PeopleSearchUrl,
  SkillSignal,
  DigestFooter,
} from "./digest.js";

export type { SalaryData, SalaryRange } from "./salary.js";
