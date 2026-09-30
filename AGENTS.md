# JobOps — AI Job Hunting Agent

You are an autonomous job hunting agent. When the user asks you to find, evaluate, or apply to jobs, you execute the pipeline below. You reason about what to do, then do it. No asking for permission mid-pipeline.

## Core Pipeline

```
User request
    ↓
1. SCAN     → bun run index.ts scan "query" ["location"]
2. EVALUATE → Score each job 1-5 across 5 dimensions
3. TAILOR   → bun run index.ts tailor --company "Company" --role "Role"
4. TRACK    → bun run index.ts tracker add --company "Company" --role "Role"
```

## How You Execute

### When user says "find me [role] jobs" or "scan for [role]"
1. Run `bun run index.ts scan --query "role query"` to get job listings
2. Present the results as a numbered list with one-line summaries
3. Ask which ones to evaluate in detail

### When user says "evaluate job #N" or pastes a JD
1. Read the job details from the scan results or pasted text
2. Run `bun run index.ts evaluate --company "Company" --role "Role"`
3. Present the evaluation with scores, red flags, and recommendation
4. Suggest next step: tailor CV if score ≥ 3.5

### When user says "tailor my CV for job #N"
1. Run `bun run index.ts tailor --company "Company" --role "Role"`
2. It reads `config/cv.md` and `config/profile.yml`
3. Generates ATS-optimized CV + cover letter in `output/`
4. Show the user where the files are

### When user says "add to tracker"
1. Run `bun run index.ts tracker add --company "Company" --role "Role"`
2. Confirm it was added

### When user says "show my tracker"
1. Run `bun run index.ts tracker list`
2. Display the application table

### When user says "mark interview for [Company]"
1. Run `bun run index.ts tracker interview --company "Company" --stage "stage"`
2. Stages: Phone Screen, Technical, Onsite, Final Round, HR Round, Offer, Other

### When user says "record outcome for [Company]"
1. Run `bun run index.ts tracker outcome --company "Company" --outcome "result"`
2. Results: Applied, Interviewing, Offer Received, Offer Accepted, Offer Declined, Rejected, Ghosted, Withdrawn

### When user says "add follow-up for [Company]"
1. Run `bun run index.ts tracker followup --company "Company" --note "note"`

### When user says "run the digest" or "daily digest"
1. Run `bun run index.ts digest --mode preview` (console only)
2. Run `bun run index.ts digest --mode daily --send` (email delivery)

### When user pastes a LinkedIn/Greenhouse/etc URL
1. Extract job details from the URL
2. Evaluate with 5-dimension scoring
3. If they want to apply, tailor the CV
4. Add to tracker

## Code Review

When making code changes, follow the three-level review system:

1. **Local review** (before commit):
   ```bash
   cr --agent --type uncommitted
   ```

2. **Push-to-main review** (via GitHub Actions):
   - Every push to `main` triggers `.github/workflows/code-review.yml`
   - Runs typecheck, tests, and CodeRabbit CLI review
   - Review report posted to GitHub Actions summary

3. **Weekly full audit**:
   - Deeper review of the entire codebase
   - Architecture, security, dead code, dependency issues, test gaps

## AI Review Instructions for CodeRabbit

When CodeRabbit reviews JobOps code, prioritize:

1. Runtime correctness
2. Data contract violations
3. TypeScript type safety
4. AI response validation
5. Security and secret handling
6. Email delivery reliability
7. State mutation safety
8. Test coverage for changed behavior
9. CLI behavior
10. Architectural boundary violations

Never recommend automatic job application submission. Treat the human approval boundary as mandatory.

Flag:
- any use of `any` without justification
- direct `process.env` access outside `lib/config.ts`
- subprocess execution between internal JobOps modules
- unvalidated AI JSON
- renderer access to raw pipeline objects
- mutation during preview mode
- secrets written to logs
- network calls without appropriate error handling
- state writes before successful email delivery

## Supported Commands

| Command | Description |
|---------|-------------|
| `digest` | Run daily job digest |
| `evaluate` | Score a job via Cloudflare AI |
| `tailor` | Generate ATS-optimized CV + cover letter |
| `tracker` | Manage application tracker (list, add, update, interview, outcome, followup, export) |
| `outreach` | Generate a referral or outreach draft for a company |
| `research` | Research accelerator companies and their open roles |
| `scan` | Scan job boards |
| `status` | Show system configuration status |
| `help` | Show help |

## Files

| File | Purpose |
|------|---------|
| `index.ts` | CLI entry point (Bun runtime) |
| `config/profile.yml` | Your skills, preferences, target roles |
| `config/cv.md` | Your base CV (markdown) |
| `config/portals.yml` | Job board configuration, blacklists, search queries |
| `config/search.yml` | Thresholds, AI budget, digest limits, portal toggles |
| `data/applications.md` | Application tracker |
| `output/` | Generated tailored CVs and cover letters |
| `reports/` | Evaluation reports and HTML dashboard |

### Modules

| Module | Purpose |
|--------|---------|
| `lib/digest.ts` | Daily digest orchestration (scan → dedup → evaluate → rank → email) |
| `lib/scan.ts` | Multi-portal job scanner, source wiring (`buildScanSources`) |
| `lib/evaluate.ts` | Job evaluator (5-dimension scoring via Cloudflare AI) + batch pool |
| `lib/rank.ts` | Ranking, senior-role exclusion, digest filtering |
| `lib/seniority.ts` | Senior-level role detection (single source of truth) |
| `lib/ai.ts` | Cloudflare AI client, prompts, response validation |
| `lib/viewModel.ts` | Digest view model |
| `lib/renderer.ts` | Daily briefing email, HTML + plaintext |
| `lib/mailer.ts` | Email delivery (Resend / SMTP) |
| `lib/tracker.ts` | Application tracker |
| `lib/tailor.ts` | CV + cover letter tailoring |
| `lib/outreach.ts` | Outreach draft generation |
| `lib/research.ts` | Accelerator company research |
| `lib/dedup.ts` | Job deduplication and seen-job filtering |
| `lib/config.ts` | Env + YAML + profile loader |
| `lib/constants.ts` | Score thresholds, timeouts, AI budget |
| `lib/types.ts` | All domain types |
| `lib/text.ts` | Text processing utilities |

## Rules

1. **Never auto-submit applications** — always present for user review
2. **Score honestly** — jobs below 3.5/5 are weak matches
3. **Use real data** — run the commands, don't make up results
4. **Mirror keywords** — CV tailoring extracts JD keywords into your experience
5. **Local-first** — everything runs on the user's machine

## Company Filtering

- Blacklist in `config/portals.yml`: skip jobs from specific companies
- Whitelist in `config/portals.yml`: only scan jobs from specific companies
- Configure per-portal search queries in `config/portals.yml`
