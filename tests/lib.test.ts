import { afterEach, describe, expect, test } from "bun:test";
import { deduplicateJobs, filterSeenJobs } from "../lib/dedup";
import { rankJobs, filterForDigest } from "../lib/rank";
import { evaluateJobs } from "../lib/evaluate";
import { parseEvaluationResponse } from "../lib/ai";
import { applyHeuristicScores, prioritizeForAi, parseDigestArgs } from "../lib/digest";
import { buildViewModel } from "../lib/viewModel";
import { renderEmail } from "../lib/renderer";
import { buildScanSources, filterJobs } from "../lib/scan";
import {
  loadPortalsConfig,
  loadActiveProfile,
  getProfileSkills,
  getProfileTargetRoles,
} from "../lib/config";
import { SCORE_STRONG, HEURISTIC_MAX_SCORE, AI_EVAL_BUDGET } from "../lib/constants";
import type { Job, JobEvaluation } from "../lib/types";

// Set before any loadEnv() call so the batch-evaluation test can reach the
// request path with a stubbed fetch. loadEnv caches, so this must run at module
// scope rather than inside a test.
process.env.CLOUDFLARE_API_KEY = "test-key";
process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";

function mkJob(over: Partial<Job> & Pick<Job, "company" | "title" | "url">): Job {
  return {
    id: `${over.company}::${over.title}::${over.url}`,
    source: "remoteok",
    description: over.description ?? "desc",
    remote: over.remote ?? true,
    ...over,
  };
}

function mkEval(overall: number): JobEvaluation {
  return {
    overall,
    roleFit: 4,
    locationFit: 4,
    growth: 4,
    compensationFit: 4,
    cultureFit: 4,
    verdict: "strong",
    recommendation: "x",
    whyMatch: [],
    matchedSkills: [],
    redFlags: [],
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

describe("seniority caps", () => {
  // Regression: SENIOR_INDICATORS contained the bare string "v" and matched with
  // text.includes(), so any title or snippet containing the letter v — "Vite",
  // "Vercel", "level" — was treated as senior and capped.
  const NOT_SENIOR: Array<[string, string]> = [
    ["Frontend Engineer", "Build React UIs in Vite"],
    ["Developer Advocate", "DevRel for the Vercel ecosystem"],
    ["Associate Engineer", "Entry level, no experience needed"],
    ["Backend Engineer", "Go and Postgres, iterate at a high level"],
    ["Data Analyst", "SQL and Looker"],
    ["Mobile Engineer", "React Native, ship fast"],
    ["Product Designer", "Own the design system end to end"],
  ];

  test.each(NOT_SENIOR)(
    "does not cap %s (%s)",
    (title, snippet) => {
      const job = mkJob({
        company: "Acme",
        title,
        url: `https://acme.com/${title}`,
        snippet,
        evaluation: mkEval(4.4),
      });
      rankJobs([job]);
      expect(job.evaluation!.overall).toBe(4.4);
      expect(job.evaluation!.verdict).toBe("strong");
      expect(job.evaluation!.redFlags).not.toContain(
        "JD appears senior-level; confirm junior/entry fit",
      );
    },
  );

  const SENIOR: Array<[string, string | undefined]> = [
    ["Senior Backend Engineer", undefined],
    ["Staff Product Designer", undefined],
    ["Principal Engineer", undefined],
    ["Engineering Manager", undefined],
    ["Engineer III", undefined],
    ["Software Engineer L5", undefined],
    ["Backend Engineer", "5+ years of experience with Go"],
    ["Full Stack Engineer", "8 years building web apps"],
  ];

  test.each(SENIOR)("excludes %s", (title, snippet) => {
    const job = mkJob({
      company: "Acme",
      title,
      url: `https://acme.com/${title}-${snippet ?? ""}`,
      snippet,
      evaluation: mkEval(4.6),
    });
    const ranked = rankJobs([job]);
    // Forced below every inclusion threshold, not merely demoted.
    expect(job.evaluation!.overall).toBeLessThan(3.5);
    expect(job.evaluation!.verdict).toBe("skip");
    expect(job.evaluation!.seniorMismatch).toBe(true);
    expect(job.evaluation!.redFlags).toContain(
      "Senior-level role — outside target profile",
    );
    // Excluded from the email entirely.
    expect(filterForDigest(ranked, 10)).toHaveLength(0);
  });

  // Regression: senior roles were capped to exactly SCORE_REVIEW (3.5), which
  // is the digest threshold, so they survived `>= minScore` and were emailed
  // as "review" candidates.
  test("a senior role the model scored 4.9 never reaches the digest", () => {
    const senior = mkJob({
      company: "Acme",
      title: "Senior Backend Engineer",
      url: "https://acme.com/sr",
      evaluation: mkEval(4.9),
    });
    const junior = mkJob({
      company: "Acme",
      title: "Junior Web Developer",
      url: "https://acme.com/jr",
      evaluation: mkEval(4.1),
    });
    const sent = filterForDigest(rankJobs([senior, junior], { minScore: 3.5 }), 10);
    expect(sent.map((j) => j.title)).toEqual(["Junior Web Developer"]);
  });

  test("exclusion survives a low score_threshold", () => {
    const senior = mkJob({
      company: "Acme",
      title: "Principal Engineer",
      url: "https://acme.com/pe",
      evaluation: mkEval(5),
    });
    // Threshold below the forced score — the seniorMismatch guard must hold.
    const sent = filterForDigest(rankJobs([senior], { minScore: 0.5 }), 10);
    expect(sent).toHaveLength(0);
  });

  test("excludes senior titles regardless of how they scored", () => {
    // Seniority is out of scope, not a weak match — a low-scoring senior role
    // is still a senior role.
    const job = mkJob({
      company: "Acme",
      title: "Senior Engineer",
      url: "https://acme.com/s",
      evaluation: mkEval(3.2),
    });
    const sent = filterForDigest(rankJobs([job]), 10);
    expect(job.evaluation!.seniorMismatch).toBe(true);
    expect(job.evaluation!.overall).toBe(1);
    expect(sent).toHaveLength(0);
  });

  test("preserves the raw score and is idempotent across reruns", () => {
    const job = mkJob({
      company: "Acme",
      title: "Senior Engineer",
      url: "https://acme.com/s2",
      evaluation: mkEval(4.6),
    });
    rankJobs([job]);
    expect(job.evaluation!.rawOverall).toBe(4.6);
    // Re-ranking must not compound or duplicate flags.
    rankJobs([job]);
    rankJobs([job]);
    expect(job.evaluation!.overall).toBe(1);
    expect(job.evaluation!.rawOverall).toBe(4.6);
    expect(job.evaluation!.redFlags).toHaveLength(2);
  });
});

describe("evaluateJobs", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function stubAI(counter: { calls: number; inFlight: number; peak: number }) {
    globalThis.fetch = (async () => {
      counter.calls++;
      counter.inFlight++;
      counter.peak = Math.max(counter.peak, counter.inFlight);
      await new Promise((r) => setTimeout(r, 5));
      counter.inFlight--;
      const body = JSON.stringify({
        overall: 4.2,
        roleFit: 4,
        locationFit: 4,
        growth: 4,
        compFit: 4,
        cultureFit: 4,
        entryLevelFit: 4,
        recommendation: "ok",
        redFlags: [],
      });
      return new Response(
        JSON.stringify({ success: true, result: { response: body } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;
  }

  function mkJobs(n: number): Job[] {
    return Array.from({ length: n }, (_, i) =>
      mkJob({ company: `C${i}`, title: `Engineer ${i}`, url: `https://c.com/${i}` }),
    );
  }

  // Regression: `concurrent` was used as the job limit, so the caller's budget
  // was silently the parallelism and only that many jobs were ever scored.
  test("evaluates `limit` jobs, independent of concurrency", async () => {
    const counter = { calls: 0, inFlight: 0, peak: 0 };
    stubAI(counter);
    const jobs = mkJobs(20);
    await evaluateJobs(jobs, { limit: 8, concurrency: 2 });
    expect(counter.calls).toBe(8);
    expect(jobs.filter((j) => j.evaluation).length).toBe(8);
  });

  test("respects the concurrency ceiling", async () => {
    const counter = { calls: 0, inFlight: 0, peak: 0 };
    stubAI(counter);
    await evaluateJobs(mkJobs(12), { limit: 12, concurrency: 3 });
    expect(counter.calls).toBe(12);
    expect(counter.peak).toBeLessThanOrEqual(3);
  });

  test("limit 0 sends no requests and leaves jobs unscored", async () => {
    const counter = { calls: 0, inFlight: 0, peak: 0 };
    stubAI(counter);
    const jobs = mkJobs(5);
    await evaluateJobs(jobs, { limit: 0 });
    expect(counter.calls).toBe(0);
    expect(jobs.every((j) => !j.evaluation)).toBe(true);
  });

  test("one malformed reply does not lose the rest of the batch", async () => {
    let n = 0;
    globalThis.fetch = (async () => {
      n++;
      const response =
        n === 2 ? "not json at all" : JSON.stringify({ overall: 4.2, roleFit: 4, locationFit: 4, growth: 4, compFit: 4, cultureFit: 4 });
      return new Response(
        JSON.stringify({ success: true, result: { response } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const jobs = mkJobs(5);
    await evaluateJobs(jobs, { limit: 5, concurrency: 2 });
    expect(jobs.filter((j) => j.evaluation).length).toBe(4);
  });
});

describe("heuristic prescreen", () => {
  // Regression: the heuristic is a prescreen for allocating the AI budget, not
  // a verdict. If it could reach SCORE_STRONG, a keyword overlap would
  // outrank a real evaluation.
  test("a keyword score can never be a strong match", () => {
    // Maximum possible overlap: every skill and role term present.
    const everything = loadActiveProfile();
    const skills = getProfileSkills(everything)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const roles = getProfileTargetRoles(everything);

    const job = mkJob({
      company: "Acme",
      title: "Junior Full Stack Developer",
      url: "https://acme.com/perfect",
      description: [...skills, ...roles].join(" "),
      remote: true,
    });
    applyHeuristicScores([job]);
    expect(job.evaluation!.overall).toBeLessThan(SCORE_STRONG);
    expect(job.evaluation!.verdict).not.toBe("strong");
  });

  test("the heuristic ceiling stays below the strong threshold", () => {
    expect(HEURISTIC_MAX_SCORE).toBeLessThan(SCORE_STRONG);
  });

  // Regression: digest.ts kept a second, looser seniority regex that matched
  // "lead"/"manager" anywhere in the description body. It now shares
  // rank.ts's rule, so a junior role is not penalised for description prose.
  test("reuses rank.ts seniority rules rather than a looser copy", () => {
    const wordsInProse = mkJob({
      company: "Acme",
      title: "Junior Backend Developer",
      url: "https://acme.com/prose",
      snippet: "You will lead a small team and help with people management",
    });
    applyHeuristicScores([wordsInProse]);
    expect(wordsInProse.evaluation!.redFlags).not.toContain(
      "May be senior-level",
    );

    const actuallySenior = mkJob({
      company: "Acme",
      title: "Senior Backend Engineer",
      url: "https://acme.com/senior",
    });
    applyHeuristicScores([actuallySenior]);
    expect(actuallySenior.evaluation!.redFlags).toContain("May be senior-level");
  });

  test("does not overwrite an existing AI evaluation", () => {
    const job = mkJob({
      company: "Acme",
      title: "Junior Web Developer",
      url: "https://acme.com/ai",
      evaluation: mkEval(4.4),
    });
    applyHeuristicScores([job]);
    expect(job.evaluation!.overall).toBe(4.4);
  });
});

describe("AI budget selection", () => {
  // Regression: the AI budget was spent on the first N jobs in scan order, so
  // a strong match late in the list lost to a weak one that happened to be
  // scanned first.
  test("spends the budget on the best-fitting candidates, not scan order", () => {
    const strong = mkJob({
      company: "Acme",
      title: "Junior Full Stack Developer",
      url: "https://acme.com/strong",
      description: "react typescript node postgres graphql",
    });
    const weak = mkJob({
      company: "Globex",
      title: "Data Entry Assistant",
      url: "https://globex.com/weak",
      description: " spreadsheets ",
    });

    const ordered = prioritizeForAi([weak, strong]);
    expect(ordered[0]!.title).toBe("Junior Full Stack Developer");
    expect(ordered[1]!.title).toBe("Data Entry Assistant");
  });

  test("does not mutate the input array", () => {
    const a = mkJob({ company: "A", title: "Junior Developer", url: "https://a.com" });
    const b = mkJob({ company: "B", title: "Intern", url: "https://b.com" });
    const input = [a, b];
    prioritizeForAi(input);
    expect(input).toEqual([a, b]);
  });

  test("the default budget is a real number, not the old hardcoded 5", () => {
    // parseDigestArgs takes full process.argv, so it slices off bin + script.
    const argv = (...rest: string[]) => ["bun", "index.ts", ...rest];
    expect(AI_EVAL_BUDGET).toBeGreaterThan(5);
    expect(parseDigestArgs(argv("digest")).evaluate).toBe(AI_EVAL_BUDGET);
    expect(parseDigestArgs(argv("digest", "--evaluate", "40")).evaluate).toBe(40);
    expect(parseDigestArgs(argv("digest", "--evaluate", "0")).evaluate).toBe(0);
  });
});

describe("shared seniority rule", () => {
  // Regression: viewModel.ts carried its own copy of the indicator list,
  // including the bare "v" that matched "Developer" and "level". It rewrote
  // generated outreach copy to claim a seniority mismatch that did not exist.
  test("outreach copy does not claim a mismatch for ordinary junior roles", () => {
    const job = mkJob({
      company: "Linear",
      title: "Developer Experience Engineer",
      url: "https://linear.app/jobs/dx",
      snippet: "Work on the Vite and Kubernetes developer tooling",
      evaluation: mkEval(4.2),
    });
    const vm = buildViewModel([job], { totalScanned: 1, freshCount: 1, unscoredCount: 0 });
    const blurb = JSON.stringify(vm);
    // The senior-mismatch line is only correct for genuinely senior roles.
    expect(blurb).not.toContain("invests in junior engineers");
    expect(blurb).not.toContain("I'm early in my career");
  });

  test("still writes the mismatch line for a real senior role", () => {
    const job = mkJob({
      company: "Stripe",
      title: "Senior Software Engineer",
      url: "https://stripe.com/jobs/sr",
      evaluation: mkEval(4.2),
    });
    const vm = buildViewModel([job], { totalScanned: 1, freshCount: 1, unscoredCount: 0 });
    expect(JSON.stringify(vm)).toContain("invests in junior engineers");
  });

  test("the rule is defined once, in seniority.ts", async () => {
    // Consumers must import the rule, not redefine it.
    for (const f of ["rank", "digest", "viewModel"]) {
      const src = await Bun.file(`lib/${f}.ts`).text();
      expect(src).not.toContain("SENIOR_TITLE_PATTERNS");
      expect(src).not.toContain("SENIOR_DESC_PATTERNS");
      expect(src).not.toContain("SENIOR_INDICATORS");
      expect(src).toContain('from "./seniority"');
    }
    const canonical = await Bun.file("lib/seniority.ts").text();
    expect(canonical).toContain("SENIOR_TITLE_PATTERNS");
  });
});

describe("title exclusion filters", () => {
  // Regression: exclude_titles was matched against `title + description`, so a
  // junior role was deleted whenever its posting copy mentioned a senior word
  // as an ordinary noun. 84 of 199 real jobs were lost this way.
  test("a junior title survives senior words in the description", () => {
    const samples: Array<[string, string]> = [
      ["Junior Developer", "You will work with a staff of engineers."],
      ["Graduate Software Engineer", "Our leadership team ships weekly."],
      ["Backend Engineer", "The team is led by three principal engineers."],
      ["Frontend Engineer", "Great managers here who invest in juniors."],
      ["Software Engineer", "We have an architect of the solution."],
    ];
    for (const [title, description] of samples) {
      const job = mkJob({
        company: "Acme",
        title,
        url: `https://acme.com/${title}`,
        description,
      });
      expect(filterJobs([job], "")).toHaveLength(1);
    }
  });

  test("senior titles are still excluded", () => {
    const seniors = [
      "Senior Backend Engineer",
      "Staff Product Designer",
      "Principal Engineer",
      "Engineering Manager",
      "Director of Engineering",
      "Software Engineer III",
      "Software Engineer IV",
    ];
    for (const title of seniors) {
      const job = mkJob({
        company: "Acme",
        title,
        url: `https://acme.com/${title}-${Math.random()}`,
        description: "Totally unrelated description with no senior words.",
      });
      expect(filterJobs([job], "")).toHaveLength(0);
    }
  });

  // "Lead" must not swallow "Leadership".
  test("exclusion is word-boundary safe", () => {
    const job = mkJob({
      company: "Acme",
      title: "Backend Engineer, Leadership Tooling",
      url: "https://acme.com/leadership",
    });
    expect(filterJobs([job], "")).toHaveLength(1);
  });

  // A "Junior" prefix does not rescue a standalone senior word.
  test("a standalone indicator excludes even with a junior prefix", () => {
    const job = mkJob({
      company: "Acme",
      title: "Junior Programme Manager",
      url: "https://acme.com/jpm",
    });
    expect(filterJobs([job], "")).toHaveLength(0);
  });
});

describe("scan source wiring", () => {
  const ALL_ON = {
    api_portals: true,
    greenhouse: true,
    lever: true,
    ashby: true,
    linkedin: false,
    instahyre: false,
    wellfound: true,
  };

  // Regression: source names lived in a second array matched to the scanners
  // by position. Disabling any portal shifted every name after it, so a
  // Greenhouse failure was reported as "remoteok".
  test("source names survive a disabled portal", () => {
    const names = (p: typeof ALL_ON) =>
      buildScanSources(p, "software engineer", "Remote").map((s) => s.source);

    expect(names({ ...ALL_ON, api_portals: false })).toEqual([
      "greenhouse",
      "lever",
      "ashby",
      "wellfound",
    ]);
    expect(names({ ...ALL_ON, greenhouse: false })).toEqual([
      "remoteok",
      "arbeitnow",
      "findwork",
      "remotive",
      "freehire",
      "lever",
      "ashby",
      "wellfound",
    ]);
    expect(names({ ...ALL_ON, wellfound: false })).toEqual([
      "remoteok",
      "arbeitnow",
      "findwork",
      "remotive",
      "freehire",
      "greenhouse",
      "lever",
      "ashby",
    ]);
  });

  test("no duplicates for any toggle combination", () => {
    const keys = Object.keys(ALL_ON) as Array<keyof typeof ALL_ON>;
    // Every subset that can be toggled independently — sample the meaningful
    // ones rather than all 128.
    for (const mask of [0, 1, 2, 3, 0b1010, 0b1101, 0b0110, 0b0011, 0b1111111, 0b1011011]) {
      const p = { ...ALL_ON };
      keys.forEach((k, i) => { p[k] = Boolean(mask & (1 << i)); });
      const found = buildScanSources(p, "q", "Remote").map((s) => s.source);
      expect(new Set(found).size).toBe(found.length);
    }
  });

  test("every source has a callable run function", () => {
    const sources = buildScanSources(ALL_ON, "q", "Remote");
    expect(sources.length).toBe(9);
    for (const s of sources) {
      expect(typeof s.run).toBe("function");
    }
  });

  test("returns nothing when every portal is off", () => {
    const off = Object.fromEntries(
      Object.keys(ALL_ON).map((k) => [k, false]),
    ) as unknown as typeof ALL_ON;
    expect(buildScanSources(off, "q", "Remote")).toEqual([]);
  });
});

describe("renderer", () => {
  const job = mkJob({
    company: "Linear",
    title: "Frontend Engineer",
    url: "https://a.com",
    location: "Remote",
    snippet: "React TypeScript",
    evaluation: {
      overall: 4.4,
      roleFit: 4,
      locationFit: 4,
      growth: 4,
      compensationFit: 4,
      cultureFit: 4,
      verdict: "strong",
      recommendation: "Strong apply",
      whyMatch: ["React"],
      matchedSkills: ["React"],
      redFlags: [],
    },
  });

  test("produces HTML with header and stats", () => {
    const vm = buildViewModel([job], { totalScanned: 10, freshCount: 5, unscoredCount: 0 });
    const html = renderEmail(vm);
    expect(html).toContain("JobOps");
    expect(html).toContain("Daily briefing");
    expect(html).toContain("Linear");
  });

  test("CTAs name the company rather than using weak verbs", () => {
    const html = renderEmail(
      buildViewModel([job], { totalScanned: 10, freshCount: 5, unscoredCount: 0 }),
    );
    expect(html).toContain("Apply to Linear");
    // Weak verbs listed as anti-patterns, plus the duplicate same-URL link.
    expect(html).not.toContain(">View</a>");
    expect(html).not.toContain("View posting");
    expect(html).not.toContain("Apply to role");
    expect(html).not.toContain(">Details<");
    expect(html).not.toContain("Learn more");
  });

  test("uses the model's reasoning instead of boilerplate", () => {
    const vm = buildViewModel([job], { totalScanned: 10, freshCount: 5, unscoredCount: 0 });
    expect(vm.heroJob!.whyMatch).toEqual(["React"]);
    // The score restatement added nothing the badge does not already show.
    expect(vm.heroJob!.whyMatch).not.toContain("Strong overall fit");
  });

  test("falls back to the template when the model gives no reasoning", () => {
    const bare = mkJob({
      company: "Acme",
      title: "Junior Developer",
      url: "https://acme.com/1",
      location: "Remote",
      evaluation: { ...job.evaluation!, whyMatch: [], matchedSkills: [] },
    });
    const vm = buildViewModel([bare], { totalScanned: 1, freshCount: 1, unscoredCount: 0 });
    // Heuristic/unscored jobs still need a populated "why".
    expect(vm.heroJob!.whyMatch.length).toBeGreaterThan(0);
    expect(vm.heroJob!.whyMatch).not.toContain("Strong overall fit");
  });
});

describe("parseEvaluationResponse", () => {
  const base = {
    overall: 4.2, roleFit: 4, locationFit: 4, growth: 4, compFit: 3, cultureFit: 4,
  };

  test("keeps model reasoning and caps it", () => {
    const parsed = parseEvaluationResponse(
      JSON.stringify({
        ...base,
        whyMatch: ["a", "b", "c", "d", "e"],
        matchedSkills: ["React", "TypeScript", "Node", "Go", "Rust", "SQL"],
        redFlags: [],
      }),
    )!;
    expect(parsed.whyMatch).toEqual(["a", "b", "c"]);
    expect(parsed.matchedSkills).toHaveLength(5);
  });

  test("tolerates a reply that omits the new fields", () => {
    const parsed = parseEvaluationResponse(JSON.stringify(base))!;
    expect(parsed.whyMatch).toEqual([]);
    expect(parsed.matchedSkills).toEqual([]);
  });

  test("drops non-string and empty entries rather than failing the reply", () => {
    const parsed = parseEvaluationResponse(
      JSON.stringify({ ...base, whyMatch: ["ok", 42, null, "  ", "fine"] }),
    )!;
    expect(parsed.whyMatch).toEqual(["ok", "fine"]);
  });

  test("still rejects a reply missing the required scores", () => {
    expect(parseEvaluationResponse(JSON.stringify({ whyMatch: ["x"] }))).toBeNull();
    expect(parseEvaluationResponse("no json here")).toBeNull();
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
