/**
 * pipeline/dedup.ts — Job deduplication
 *
 * Removes duplicate jobs based on company::title::url composite key.
 */

import type { Job } from "../domain/job";
import { createJobId } from "../domain/job";

export interface DedupResult {
    unique: Job[];
    duplicates: number;
}

/**
 * Deduplicate jobs by composite key (company::title::url).
 */
export function deduplicateJobs(jobs: Job[]): DedupResult {
    const seen = new Set<string>();
    const unique: Job[] = [];

    for (const job of jobs) {
        const id = job.id || createJobId(job);
        if (!seen.has(id)) {
            seen.add(id);
            unique.push(job);
        }
    }

    return {
        unique,
        duplicates: jobs.length - unique.length,
    };
}

/**
 * Filter out previously seen jobs (from digest-seen.json).
 */
export function filterSeenJobs(jobs: Job[], seenIds: Set<string>): Job[] {
    return jobs.filter((job) => {
        const id = job.id || createJobId(job);
        return !seenIds.has(id);
    });
}

/**
 * Create a job ID for tracking.
 */
export function getJobId(job: Job): string {
    return job.id || createJobId(job);
}
