/**
 * domain/application.ts — Application tracker types
 */

export type ApplicationStatus =
  | "Applied"
  | "Interviewing"
  | "Offer Received"
  | "Offer Accepted"
  | "Offer Declined"
  | "Rejected"
  | "Ghosted"
  | "Withdrawn";

export type InterviewStage =
  | "Phone Screen"
  | "Technical"
  | "Onsite"
  | "Final Round"
  | "HR Round"
  | "Offer"
  | "Other";

export interface Interview {
  stage: InterviewStage;
  date?: string;
  notes?: string;
}

export interface FollowUp {
  date: string;
  note: string;
}

export interface Application {
  company: string;
  role: string;
  status: ApplicationStatus;
  appliedAt?: string;
  interviews: Interview[];
  followUps: FollowUp[];
  outcome?: string;
  notes?: string;
}
