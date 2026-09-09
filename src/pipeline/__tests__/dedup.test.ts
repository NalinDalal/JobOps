import { describe, expect, test } from "bun:test";
import { deduplicateJobs, filterSeenJobs, getJobId } from "../dedup";
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

describe("deduplicateJobs", () => {
    test("removes duplicate jobs", () => {
        const jobs = [
            makeJob({ company: "A", title: "Eng", url: "https://a.com" }),
            makeJob({ company: "A", title: "Eng", url: "https://a.com" }),
            makeJob({ company: "B", title: "Eng", url: "https://b.com" }),
        ];
        const result = deduplicateJobs(jobs);
        expect(result.unique.length).toBe(2);
        expect(result.duplicates).toBe(1);
    });

    test("returns all jobs when no duplicates", () => {
        const jobs = [
            makeJob({ company: "A", title: "Eng", url: "https://a.com" }),
            makeJob({ company: "B", title: "Eng", url: "https://b.com" }),
        ];
        const result = deduplicateJobs(jobs);
        expect(result.unique.length).toBe(2);
        expect(result.duplicates).toBe(0);
    });

    test("handles empty input", () => {
        const result = deduplicateJobs([]);
        expect(result.unique.length).toBe(0);
        expect(result.duplicates).toBe(0);
    });
});

describe("filterSeenJobs", () => {
    test("filters out seen jobs", () => {
        const jobs = [
            makeJob({ company: "A", title: "Eng", url: "https://a.com" }),
            makeJob({ company: "B", title: "Eng", url: "https://b.com" }),
        ];
        const seen = new Set(["A::Eng::https://a.com"]);
        const result = filterSeenJobs(jobs, seen);
        expect(result.length).toBe(1);
        expect(result[0]!.company).toBe("B");
    });

    test("returns all jobs when none seen", () => {
        const jobs = [makeJob({ company: "A", title: "Eng", url: "https://a.com" })];
        const seen = new Set<string>();
        const result = filterSeenJobs(jobs, seen);
        expect(result.length).toBe(1);
    });
});

describe("getJobId", () => {
    test("returns existing id if set", () => {
        const job = makeJob({ id: "custom-id" });
        expect(getJobId(job)).toBe("custom-id");
    });

    test("generates composite id from company/title/url", () => {
        const job = makeJob({ company: "X", title: "Y", url: "https://z.com" });
        expect(getJobId(job)).toBe("X::Y::https://z.com");
    });
});
