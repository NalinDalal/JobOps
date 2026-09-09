import { describe, expect, test } from "bun:test";
import { validateJob, validateJobSafe } from "../job";

describe("validateJob", () => {
    test("accepts valid job", () => {
        const job = validateJob({
            id: "1",
            source: "remoteok",
            title: "Engineer",
            company: "Acme",
            url: "https://example.com",
            description: "desc",
            remote: true,
        });
        expect(job.title).toBe("Engineer");
    });

    test("rejects job with missing required fields", () => {
        const result = validateJobSafe({ title: "Engineer" });
        expect(result.success).toBe(false);
    });

    test("rejects invalid source", () => {
        const result = validateJobSafe({
            id: "1",
            source: "invalid_source",
            title: "Engineer",
            company: "Acme",
            url: "https://example.com",
            description: "desc",
            remote: true,
        });
        expect(result.success).toBe(false);
    });

    test("accepts optional fields", () => {
        const job = validateJob({
            id: "1",
            source: "linkedin",
            title: "Engineer",
            company: "Acme",
            url: "https://example.com",
            description: "desc",
            remote: true,
            location: "Remote",
            compensation: { currency: "USD", min: 100000, max: 200000, period: "yearly" },
            tags: ["react", "typescript"],
        });
        expect(job.location).toBe("Remote");
        expect(job.tags).toEqual(["react", "typescript"]);
    });
});
