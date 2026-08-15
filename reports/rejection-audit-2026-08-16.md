# Rejection Audit — Mode 1

**Date:** 2026-08-16
**Candidate CV:** `config/cv.md` (post P4 update)
**Job:** [Software Engineer, Stripe (Seattle)](https://boards.greenhouse.io/stripe/jobs/7991636)
**JD language:** Java, Ruby, Scala, Go · full-stack at scale · database management · SQL · AWS · production debugging · observability (Datadog/Prometheus) · design patterns · 2 yrs experience

---

## 1. Fit verdict (before CV tweaks)

| Factor | Requirement | Candidate | Fit |
|---|---|---|---|
| Experience | 2+ years software dev | 0-2 yrs (new grad, 2026) | ❌ Hard gap |
| Languages | Java, Scala, Python + AWS | C++, TypeScript, JavaScript, Rust, Solidity, SQL + AWS | ⚠️ Stack mismatch (Python absent; Java/Scala absent) |
| Full-stack at scale | Full-stack web apps at scale | React/Node/PostgreSQL apps, Vercel | ✅ Partial |
| Database mgmt + SQL | 2 yrs DB + SQL | PostgreSQL, Prisma, MongoDB, NeonDB, SQL | ✅ |
| Prod debugging | Debug production issues | Docker socket permissions fix (3 services) | ✅ |
| Design patterns | Industry design patterns | Not named in CV | ⚠️ Not stated |

**Honest verdict: this specific JD is a stretch** — hard language + experience requirements can't be fixed by any CV rewrite, and correctly so (no fabrication per JobOps rule). The audit value is the *pattern*, not this single job: below are the repeatable gaps.

---

## 2. Keyword coverage matrix (ATS check)

Top JD terms → present (✓) / absent (✗) in `config/cv.md`:

| JD term | In CV? | Note |
|---|---|---|
| APIs / services design | ✓ | "real-time APIs", "REST endpoints" |
| AWS | ✓ | DevOps section |
| SQL / database management | ✓ | PostgreSQL, Prisma, MongoDB, NeonDB, SQL |
| Debug production | ✓ | Docker socket permissions bullet (added P4) |
| Full-stack web applications | ✓ | Blog platform, Blind, CoDraw, Headstarter |
| Design patterns | ✗ | Not named anywhere |
| Java / Scala / Python / Go | ✗ | Absent from CV — must STAY absent (not in base CV; guard would flag) |
| Observability (Datadog, Prometheus) | ✗ | Absent — do not add unless real |
| Testing / validation | ✓ (partial) | "Jest" in Tools; not called out in bullets |
| Large-scale / at scale | ⚠️ | No scale numbers anywhere |

**ATS score estimate vs this JD: ~55/100.** ~70 of that is structural (standard headings, single column, keyword matrix sections), the rest is language/experience hard-gaps. For a TypeScript/Node/Postgres JD (which matches the profile), the same CV scores **~80-85** — strong.

---

## 3. Bullet audit (Google XYZ formula)

Formula: **Accomplished [X] as measured by [Y] by doing [Z].**

| Bullet | X (action) | Y (metric) | Z (method) | Verdict |
|---|---|---|---|---|
| LeetCode 550+ / Codeforces 830+ | ✅ | ✅ | ✅ | Best bullets in CV |
| Docker socket fix (3 services) | ✅ | ✅ | ✅ | Now XYZ-complete |
| 30+ CLI/system tools | ✅ | ✅ | ✅* | Good (Y = "30+") |
| Blind — "cursor-based pagination… for high performance" | ✅ | ⚠️ no number | ✅ | Add Y only if real (e.g. p95, payload size) |
| Headstarter — "optimized RESTful API performance" | ✅ | ❌ vague ("optimized") | ⚠️ | Weakest claim: no Y, no Z |
| GSSoC — "Designed scalable systems…" | ✅ | ❌ | ⚠️ | Task-flavored, no Y |
| Blog platform — "Built and deployed…" | ✅ | ❌ | ✅ | Fine as proof-of-skills, not impact |
| CoDraw — "diff-based sync for efficient state updates" | ✅ | ❌ ("efficient") | ✅ | Add Y if real (e.g. ms latency, payload %) |

**Pattern:** 60% of bullets are task-list shaped, not impact-shaped. The CV's real numbers exist (550+, 830+, 30+, 3) but they live in two sections; the Experience/Projects bullets rarely carry them.

---

## 4. 6-second skim test

- Header: name, phone, email, LinkedIn, GitHub, LeetCode, CodeForces — complete, correct order. ✅
- Section order: Summary → Education → Skills → Projects → Experience → Achievements. Recruiters expect Experience above Projects for experienced hires; **Projects-first is fine for a new grad**. ✅
- Bold highlights (`**C++**`, `**Prisma**`, `**real-time APIs**`, `**550+**`) — good scan density. ✅
- ⚠️ **Pandoc separator rows** (lines of `----` inside the `.md`) are LaTeX-source artifacts: if any tool ever consumes the raw markdown as text (ATS extraction, cover-letter input reads `config/cv.md` raw), those separator lines leak as noise. Not an issue for the pandoc PDF path; worth knowing.
- One page: yes, compact. ✅

---

## 5. Recommended edits (safe = real data only)

1. **Repo links added** — CoDraw and Modheshwari now carry GitHub links; PlayMesh dropped from the CV at the user's request. [resolved 2026-08-16]
2. **Headstarter bullet**: replace "optimized RESTful API performance" (no evidence) with the *mechanism* if you did something concrete (caching, batching, indexing) — e.g. "...using [Z]". [needs: which mechanism]
3. **Blind bullet**: add a real Y if known (e.g. "cut initial payload 40%", "p95 under 200ms"). [needs: real number]
4. **Do NOT add** Python/Java/Scala/Go/observability → the fabrication guard in `tailor.mjs` will (correctly) flag any tailored CV that tries.
5. **Fit strategy**: target JDs whose required languages match the CV (TypeScript/Node/React/Postgres, C++/Rust systems roles). The scan's title filter + auto queries already shape toward "Software Engineer" — add stack-specific queries (e.g. "typescript engineer", "rust developer") in `config/portals.yml` `search_queries` for higher-match postings.

---

**Result: base CV is structurally sound for its stack (≈85 on TS/Node JDs); its ceiling is 3 unquantified bullets + no project links. Items 1-3 are yours to approve; 4-5 are process, already guarded.**