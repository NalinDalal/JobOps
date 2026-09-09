import { describe, expect, test, afterEach } from "bun:test";
import { loadSeen, saveSeen, parseDigestArgs } from "../digest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";

const TEST_ROOT = resolve(import.meta.dir, "../../tmp-test-digest");

afterEach(() => {
    if (existsSync(TEST_ROOT)) {
        rmSync(TEST_ROOT, { recursive: true });
    }
});

describe("loadSeen / saveSeen", () => {
    test("returns empty set when no file exists", () => {
        const seen = loadSeen(TEST_ROOT);
        expect(seen.size).toBe(0);
    });

    test("round-trips seen jobs", () => {
        mkdirSync(resolve(TEST_ROOT, "data"), { recursive: true });
        const seen = new Set(["A::Eng::https://a.com", "B::Dev::https://b.com"]);
        saveSeen(seen, TEST_ROOT);

        const loaded = loadSeen(TEST_ROOT);
        expect(loaded.size).toBe(2);
        expect(loaded.has("A::Eng::https://a.com")).toBe(true);
        expect(loaded.has("B::Dev::https://b.com")).toBe(true);
    });

    test("preserves existing entries when adding new ones", () => {
        mkdirSync(resolve(TEST_ROOT, "data"), { recursive: true });
        const initial = new Set(["A::Eng::https://a.com"]);
        saveSeen(initial, TEST_ROOT);

        const updated = loadSeen(TEST_ROOT);
        updated.add("B::Dev::https://b.com");
        saveSeen(updated, TEST_ROOT);

        const final = loadSeen(TEST_ROOT);
        expect(final.size).toBe(2);
    });
});

describe("parseDigestArgs", () => {
    test("defaults to preview mode", () => {
        const opts = parseDigestArgs(["node", "digest"]);
        expect(opts.mode).toBe("preview");
        expect(opts.query).toBe("auto");
        expect(opts.max).toBe(50);
    });

    test("parses --send flag as daily mode", () => {
        const opts = parseDigestArgs(["node", "digest", "--send"]);
        expect(opts.mode).toBe("daily");
    });

    test("parses --mode daily", () => {
        const opts = parseDigestArgs(["node", "digest", "--mode", "daily"]);
        expect(opts.mode).toBe("daily");
    });

    test("parses --query", () => {
        const opts = parseDigestArgs([
            "node",
            "digest",
            "--query",
            "react developer",
        ]);
        expect(opts.query).toBe("react developer");
    });

    test("parses --max", () => {
        const opts = parseDigestArgs(["node", "digest", "--max", "10"]);
        expect(opts.max).toBe(10);
    });

    test("parses --mock flag", () => {
        const opts = parseDigestArgs(["node", "digest", "--mock"]);
        expect(opts.mock).toBe(true);
    });
});
