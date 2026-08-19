# Architecture

JobOps is a local-first, script-driven job application pipeline. There is no central server, no database daemon, and no cloud lock-in. Every feature is a Node.js script that reads/writes plain files.

## Data flow

```
scan.mjs  →  raw job listings (JSON)
   ↓
evaluate.mjs  →  5-dimension score + red flags (JSON + markdown report)
   ↓
tailor.mjs  →  ATS-optimized CV + cover letter (markdown)
   ↓
tracker.mjs  →  application state (data/applications.md + CSV)
   ↓
html-report.mjs  →  offline dashboard (reports/tracker-dashboard.html)
   ↓
digest.mjs  →  daily email (Resend) or console preview
```

## Script ownership

| Script | Owns | Persists |
|--------|------|----------|
| `scan.mjs` | Fetching jobs from portals, dedup, title/location/company filtering | `data/digest-seen.json` (seen-job IDs for digest dedup) |
| `evaluate.mjs` | AI scoring via Cloudflare Workers AI | `reports/*.md` evaluation reports |
| `tailor.mjs` | CV + cover letter generation, fabricated-skill warnings, ATS source checks | `output/*-cv.md`, `output/*-cover-letter.md` |
| `tracker.mjs` | Application table, interview stages, outcomes, follow-ups, attention queue, CSV export | `data/applications.md`, `data/tracker-export.csv` |
| `rank.mjs` | Batch scoring of scraped jobs, ranked shortlist | stdout JSON + optional report |
| `interview.mjs` | Interview prep pack generation from tracker entry | stdout markdown |
| `upskill.mjs` | Skill gap analysis, learning plan generation | stdout markdown |
| `salary.mjs` | Salary lookup from local JSON data | stdout |
| `digest.mjs` | Scan → dedup → score top N → email/preview | `data/digest-seen.json`, `reports/digest-*.md` |
| `html-report.mjs` | Self-contained HTML dashboard from tracker + archives | `reports/tracker-dashboard.html` |
| `doctor.mjs` | Prerequisite and config validation | stdout |

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

After recording outcomes, `tracker.mjs review` analyzes success/rejection patterns and proposes targeting changes without rewriting your profile facts.
