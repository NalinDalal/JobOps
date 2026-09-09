/**
 * domain/job.ts — Canonical job domain model
 *
 * This is the single source of truth for job representation.
 * All sources produce Job objects; all pipelines consume Job objects.
 */

export type JobSource =
  | "remoteok"
  | "arbeitnow"
  | "findwork"
  | "remotive"
  | "freehire"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "linkedin"
  | "wellfound"
  | "unknown";

export interface Compensation {
  currency?: string;
  min?: number;
  max?: number;
  period?: "hourly" | "daily" | "monthly" | "yearly";
  raw?: string;
}

export interface Job {
  id: string;
  source: JobSource;
  title: string;
  company: string;
  location?: string;
  url: string;
  description: string;
  snippet?: string;
  postedAt?: string;
  remote: boolean;
  compensation?: Compensation;
  tags?: string[];
  evaluation?: import("./evaluation").JobEvaluation;
}

export function createJobId(job: Pick<Job, "company" | "title" | "url">): string {
  return `${job.company}::${job.title}::${job.url}`;
}
