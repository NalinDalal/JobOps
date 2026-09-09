# Architecture

JobOps is a local-first, TypeScript/Bun application pipeline. There is no central server, no database daemon, and no cloud lock-in. Every feature is a TypeScript module that reads/writes plain files.

## Data flow

```
src/pipeline/scan.ts  →  raw job listings (Job[])
   ↓
src/pipeline/dedup.ts  →  deduplicated jobs
   ↓
src/pipeline/evaluate.ts  →  5-dimension score + red flags (JobEvaluation)
   ↓
src/pipeline/rank.ts  →  ranked shortlist
   ↓
src/tailor/index.ts  →  ATS-optimized CV + cover letter (markdown)
   ↓
src/tracker/index.ts  →  application state (data/applications.md + CSV)
   ↓
src/digest/viewModel.ts  →  digest view model
   ↓
src/digest/renderer.ts  →  HTML email
   ↓
src/digest/mailer.ts  →  daily email (Resend/SMTP) or console preview
```

## Module ownership

| Module | Owns | Persists |
|--------|------|----------|
| `src/pipeline/scan.ts` | Fetching jobs from portals, dedup, title/location/company filtering | `data/digest-seen.json` (seen-job IDs for digest dedup) |
| `src/pipeline/evaluate.ts` | AI scoring via Cloudflare Workers AI | `reports/*.md` evaluation reports |
| `src/tailor/index.ts` | CV + cover letter generation, fabricated-skill warnings, ATS source checks | `output/*-cv.md`, `output/*-cover-letter.md` |
| `src/tracker/index.ts` | Application table, interview stages, outcomes, follow-ups, attention queue, CSV export | `data/applications.md`, `data/tracker-export.csv` |
| `src/pipeline/rank.ts` | Batch scoring of scraped jobs, ranked shortlist | stdout JSON + optional report |
| `src/digest/index.ts` | Scan → dedup → score top N → email/preview | `data/digest-seen.json`, `reports/digest-*.md` |
| `src/cli/index.ts` | CLI entry point, command routing | stdout |

## Configuration layers

| Layer | Path | Purpose |
|-------|------|---------|
| Candidate profile | `config/profile.yml` | Who you are: skills, roles, locations, experience, preferences |
| Profile presets | `config/profiles/*.yaml` | Named role configurations (search queries, scoring, outreach) |
| Active profile | `config/profiles/active.json` | Which preset is currently active |
| Autonomy level | `autonomy_level` in active profile | `review-each` (attention queue) or `routine-auto` (direct to Saved) |
| Portal config | `config/portals.yml` | Boards, blacklists, whitelists, title filters, search queries |
| Base CV | `config/cv.md` | Source material for tailoring |
| Environment | `.env` | Cloudflare + Resend credentials (git-ignored) |
| Salary data | `data/salary/*.json` | Optional local salary benchmarks |

## Extension points

1. **Portals** — Add boards in `config/portals.yml`. The scanner auto-discovers enabled sources.
2. **Profiles** — Add YAML presets in `config/profiles/`. Switch active profile without code changes.
3. **Scoring** — Evaluation weights are equal by default. Override per profile if needed.
4. **Templates** — Replace `config/cv.md` content or add new profile-specific base CVs.

## Authority model

```
Automation  →  informs  (digest emails, scan results)
Agent       →  executes (evaluate, tailor, rank, interview prep, upskill)
Human       →  approves (applying, accepting offers, sending outreach)
```

No script auto-submits an application or sends email on your behalf without explicit flags.

### Attention queue

When `autonomy_level` is `review-each`, new tracker entries start in `Attention` status. The human must explicitly move them to `Saved` or `Applied`. This is the "needs human review" buffer between scoring and action.

When `autonomy_level` is `routine-auto`, entries go directly to `Saved`. Use this only if you trust the scoring and filtering completely.

### Outcome review

After recording outcomes, the tracker analyzes success/rejection patterns and proposes targeting changes without rewriting your profile facts.
