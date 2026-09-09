/**
 * domain/index.ts — Export all domain types
 */

export type { Job, JobSource, Compensation } from "./job";
export { createJobId } from "./job";

export type { JobEvaluation, Verdict } from "./evaluation";
export { scoreToVerdict, verdictLabel, topLabel } from "./evaluation";

export type {
    Profile,
    Candidate,
    ProfileSkills,
    ProfileExperience,
    OutreachConfig,
} from "./profile";
export {
    getProfileSkills,
    getProfileTargetRoles,
    getProfileTargetLocations,
    getProfileExperience,
    getProfileCandidate,
} from "./profile";

export type {
    Application,
    ApplicationStatus,
    InterviewStage,
    Interview,
    FollowUp,
} from "./application";

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
} from "./digest";

export type { SalaryData, SalaryRange } from "./salary";
