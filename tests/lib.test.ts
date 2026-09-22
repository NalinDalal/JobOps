import { describe, expect, test } from "bun:test";
import { deduplicateJobs, filterSeenJobs } from "../lib/dedup";
import { rankJobs, filterForDigest } from "../lib/rank";
import { buildViewModel } from "../lib/viewModel";
import { renderEmail } from "../lib/renderer";
import { loadPortalsConfig } from "../lib/config";
import type { Job } from "../lib/types";

function mkJob(over: Partial<Job> & Pick<Job, "company" | "title" | "url">): Job {
  return {
    id: `${over.company}::${over.title}::${over.url}`,
    source: "remoteok",
    description: over.description ?? "desc",
    remote: over.remote ?? true,
    ...over,
  };
}

describe("dedup", () => {
  test("removes cross-portal duplicates", () => {
    const a = mkJob({ company: "Linear", title: "Frontend Engineer", url: "https://a.com" });
    const b = mkJob({ company: "Linear", title: "Frontend Engineer", url: "https://a.com" });
    const c = mkJob({ company: "Supabase", title: "Backend Engineer", url: "https://b.com" });
    const { unique, duplicates } = deduplicateJobs([a, b, c]);
    expect(duplicates).toBe(1);
    expect(unique.length).toBe(2);
  });

  test("filterSeenJobs respects seen set", () => {
    const a = mkJob({ company: "A", title: "T", url: "https://a.com" });
    const b = mkJob({ company: "B", title: "T", url: "https://b.com" });
    const seen = new Set([a.id]);
    expect(filterSeenJobs([a, b], seen)).toEqual([b]);
  });
});

describe("rank + digest filtering", () => {
  test("heuristic-like jobs are split correctly", () => {
    const strong = mkJob({ company: "A", title: "Frontend Engineer", url: "https://a.com", evaluation: { overall: 4.2, roleFit: 4, locationFit: 4, growth: 4, compensationFit: 4, cultureFit: 4, verdict: "strong", recommendation: "x", whyMatch: [], matchedSkills: [], redFlags: [] } });
    const review = mkJob({ company: "B", title: "Full Stack", url: "https://b.com", evaluation: { overall: 3.6, roleFit: 3.6, locationFit: 3, growth: 3, compensationFit: 3, cultureFit: 3, verdict: "review", recommendation: "x", whyMatch: [], matchedSkills: [], redFlags: [] } });
    const unscored = mkJob({ company: "C", title: "Dev", url: "https://c.com" });
    const ranked = rankJobs([review, unscored, strong]);
    expect(ranked.strongMatches.length).toBe(1);
    expect(ranked.worthReviewing.length).toBe(1);
    expect(ranked.unscored.length).toBe(1);
    expect(filterForDigest(ranked, 10).length).toBe(2);
  });
});

describe("renderer", () => {
  test("produces HTML with header and stats", () => {
    const job = mkJob({ company: "Linear", title: "Frontend Engineer", url: "https://a.com", location: "Remote", snippet: "React TypeScript", evaluation: { overall: 4.4, roleFit: 4, locationFit: 4, growth: 4, compensationFit: 4, cultureFit: 4, verdict: "strong", recommendation: "Strong apply", whyMatch: ["React"], matchedSkills: ["React"], redFlags: [] } });
    const vm = buildViewModel([job], { totalScanned: 10, freshCount: 5, unscoredCount: 0 });
    const html = renderEmail(vm);
    expect(html).toContain("JobOps");
    expect(html).toContain("Daily briefing");
    expect(html).toContain("Linear");
    expect(html).toContain("View posting");
  });
});

describe("portals loader", () => {
  test("unwraps greenhouse boards", () => {
    const cfg = loadPortalsConfig();
    // should be array of entries with slug, not empty when portals.yml has boards
    expect(Array.isArray(cfg.greenhouse)).toBe(true);
    if (cfg.greenhouse.length > 0) {
      expect(cfg.greenhouse[0]!.slug).toBeDefined();
    }
  });
});
