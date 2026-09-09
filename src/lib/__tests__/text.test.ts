import { describe, expect, test } from "bun:test";
import { stripHtml, truncate, escapeHtml, normalizeLocation } from "../text";

describe("stripHtml", () => {
    test("removes HTML tags", () => {
        expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
    });

    test("decodes HTML entities", () => {
        expect(stripHtml("a &amp; b &lt; c &gt; d")).toBe("a & b < c > d");
    });

    test("collapses whitespace", () => {
        expect(stripHtml("hello   world\n\nfoo")).toBe("hello world foo");
    });

    test("returns empty string for null/undefined", () => {
        expect(stripHtml(null)).toBe("");
        expect(stripHtml(undefined)).toBe("");
    });
});

describe("truncate", () => {
    test("returns short strings unchanged", () => {
        expect(truncate("hi", 10)).toBe("hi");
    });

    test("truncates long strings with ellipsis", () => {
        const result = truncate("this is a very long string that should be truncated", 20);
        expect(result.length).toBeLessThanOrEqual(20);
        expect(result).toContain("…");
    });

    test("strips HTML before truncating", () => {
        const result = truncate("<b>hello world</b> extra text", 15);
        expect(result).not.toContain("<b>");
    });
});

describe("escapeHtml", () => {
    test("escapes special characters", () => {
        expect(escapeHtml('<script>alert("xss")</script>')).toBe(
            "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
        );
    });

    test("escapes ampersand", () => {
        expect(escapeHtml("a & b")).toBe("a &amp; b");
    });

    test("returns empty string for null/undefined", () => {
        expect(escapeHtml(null)).toBe("");
        expect(escapeHtml(undefined)).toBe("");
    });
});

describe("normalizeLocation", () => {
    test("returns Remote for empty input", () => {
        expect(normalizeLocation("")).toBe("Remote");
        expect(normalizeLocation(null)).toBe("Remote");
    });

    test("strips country suffixes", () => {
        expect(normalizeLocation("Bangalore, India")).toBe("Bangalore");
    });

    test("handles pipe-separated locations", () => {
        const result = normalizeLocation("Bangalore · Remote");
        expect(result).toBe("Bangalore / Remote");
    });

    test("strips posted date", () => {
        expect(normalizeLocation("Remote · Posted 2024-01-15")).toBe("Remote");
    });
});
