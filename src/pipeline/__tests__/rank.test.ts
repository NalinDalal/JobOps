import { describe, expect, test } from "bun:test";
import { rankJobs, filterForDigest } from "../rank";
import type { Job } from "../../domain/job";

function makeJob(overrides: Partial<Job> = {}): Job {
    return {
        id: "",
        source: "unknown",
        title: "Engineer",
        company: "Acme",
        url: "https://example.com/1",
        description: "desc",
        remote: true,
        ...overrides,
    };
}

function makeScoredJob(score: number, title = "Engineer"): Job {
    return makeJob({
        title,
        evaluation: {
            overall: score,
            roleFit: 4,
            locationFit: 3,
            cultureFit: 4,
            growth: 3,
            compensationFit: 3,
            verdict: "strong" as const,
            recommendation: "Apply",
            whyMatch: [],
            matchedSkills: [],
            redFlags: [],
        },
    });
}

describe("rankJobs", () => {
    test("categorizes jobs by score thresholds", () => {
        const jobs = [
            makeScoredJob(4.5), // strong
            makeScoredJob(3.7), // worth reviewing
            makeScoredJob(2.5), // below threshold
        ];
        const result = rankJobs(jobs);
        expect(result.strongMatches.length).toBe(1);
        expect(result.worthReviewing.length).toBe(1);
        expect(result.belowThreshold.length).toBe(1);
        expect(result.unscored.length).toBe(0);
    });

    test("separates unscored jobs", () => {
        const jobs = [makeScoredJob(4.0), makeJob({ title: "No score" })];
        const result = rankJobs(jobs);
        expect(result.strongMatches.length).toBe(1);
        expect(result.unscored.length).toBe(1);
    });

    test("sorts strong matches by score descending", () => {
        const jobs = [makeScoredJob(4.2), makeScoredJob(4.8), makeScoredJob(4.5)];
        const result = rankJobs(jobs);
        expect(result.strongMatches[0]!.evaluation!.overall).toBe(4.8);
        expect(result.strongMatches[1]!.evaluation!.overall).toBe(4.5);
        expect(result.strongMatches[2]!.evaluation!.overall).toBe(4.2);
    });

    test("downgrades senior roles", () => {
        const jobs = [makeScoredJob(4.5, "Senior Staff Engineer")];
        const result = rankJobs(jobs);
        expect(result.strongMatches.length).toBe(0);
        expect(result.worthReviewing.length).toBe(1);
        expect(
            result.worthReviewing[0]!.evaluation!.redFlags.some((f) =>
                f.includes("senior-level"),
            ),
        ).toBe(true);
    });
});

describe("filterForDigest", () => {
    test("returns only scored jobs up to maxJobs", () => {
        const ranked = {
            strongMatches: [makeScoredJob(4.5), makeScoredJob(4.2)],
            worthReviewing: [makeScoredJob(3.7)],
            belowThreshold: [],
            unscored: [],
        };
        const result = filterForDigest(ranked, 2);
        expect(result.length).toBe(2);
    });

    test("returns empty when no scored jobs", () => {
        const ranked = {
            strongMatches: [],
            worthReviewing: [],
            belowThreshold: [],
            unscored: [makeJob()],
        };
        const result = filterForDigest(ranked);
        expect(result.length).toBe(0);
    });
});
