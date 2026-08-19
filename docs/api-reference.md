# API Reference

## scan.mjs

Search job boards.

```
node scripts/scan.mjs <query> <location>
node scripts/scan.mjs auto <location>
```

**Output:** JSON array to stdout.

**Job object:**

```json
{
  "id": 1,
  "title": "Software Engineer",
  "company": "Stripe",
  "location": "Remote",
  "url": "https://...",
  "source": "greenhouse:stripe",
  "tags": ["backend", "go"],
  "snippet": "...",
  "posted": "2025-08-18"
}
```

## evaluate.mjs

Score a single job via Cloudflare AI.

```
node scripts/evaluate.mjs '{"title":"...","company":"...","location":"...","description":"..."}'
```

**Output:** Markdown table + `---EVAL_JSON---` followed by raw JSON.

**JSON schema:**

```json
{
  "overall": 4.2,
  "roleFit": 4.5,
  "locationFit": 4.0,
  "growthPotential": 4.5,
  "compFit": 4.0,
  "cultureFit": 4.0,
  "recommendation": "Strong Apply",
  "analysis": "...",
  "redFlags": []
}
```

## tailor.mjs

Generate tailored CV + cover letter.

```
node scripts/tailor.mjs '{"title":"...","company":"...","location":"...","description":"..."}'
```

**Output:** Two files in `output/`:
- `{company}-cv.md`
- `{company}-cover-letter.md`

**Warnings:**
- Fabricated-skill warnings are printed to stderr if the model adds skills not present in `config/cv.md`.
- ATS checks run on the generated markdown and warnings are printed.

## tracker.mjs

Application tracker.

```
node scripts/tracker.mjs list
node scripts/tracker.mjs add "Company" "Role"
node scripts/tracker.mjs update "Company" "Status"
node scripts/tracker.mjs interview "Company" "Stage" ["date"]
node scripts/tracker.mjs outcome "Company" "Result"
node scripts/tracker.mjs followup "Company" "Note" ["date"]
node scripts/tracker.mjs export
node scripts/tracker.mjs report
node scripts/tracker.mjs attention
node scripts/tracker.mjs review
node scripts/tracker.mjs autonomy
node scripts/tracker.mjs reset <mode>
```

**Valid statuses:** `Saved`, `Attention`, `Applied`, `Interviewing`, `Offer`, `Rejected`, `Withdrawn`

**Attention queue:** When `autonomy_level` is `review-each`, new entries start in `Attention` status. You must explicitly move them to `Saved` or `Applied` before applying.

**Outcome review:** `node scripts/tracker.mjs review` prints outcome distribution, success/rejection patterns, and targeting suggestions.

**Autonomy level:** `node scripts/tracker.mjs autonomy` shows the current level. Set via `autonomy_level` in your active profile YAML (`review-each` or `routine-auto`).

**Reset modes:** `profile` (clears tracker rows, keeps header), `documents` (deletes `data/applications/`), `all` (both). Requires typing `RESET` to confirm.

## rank.mjs

Batch score all jobs from a scan.

```
node scripts/rank.mjs <query> <location> [--limit N] [--min-score 3.5]
```

**Output:** JSON array sorted by `overall` descending. Each entry includes the full evaluation object.

## interview.mjs

Generate interview prep pack for a tracked application.

```
node scripts/interview.mjs "Company" ["stage"]
```

**Output:** Markdown to stdout with:
- Company overview
- Role-specific likely questions
- STAR-mapped answers from `config/cv.md`
- Questions to ask the interviewer

Requires the company to exist in `data/applications.md`.

## upskill.mjs

Analyze skill gaps between your profile and target jobs.

```
node scripts/upskill.mjs [--query "software engineer"] [--limit 10]
```

**Output:** Markdown to stdout with:
- Gap heatmap (skills you have vs. skills jobs want)
- Prioritized learning plan with web-searched resources
- Time estimates per skill

## salary.mjs

Look up salary from local data.

```
node scripts/salary.mjs "Software Engineer" ["India"]
```

**Output:** JSON with min/max/median from `data/salary/*.json`.

**Data format (`data/salary/india-tech.json`):**

```json
{
  "roles": [
    { "title": "Software Engineer", "min": 600000, "max": 1800000, "median": 1200000, "currency": "INR", "source": "levels.fyi" }
  ]
}
```

## digest.mjs

Daily digest.

```
node scripts/digest.mjs [--mode preview|daily] [--max N] [--evaluate N] [--query "auto|<query>"]
```

**Flags:**
- `--mode preview` — print to console only (default)
- `--mode daily` — email via Resend + mark jobs as seen
- `--max N` — cap digest to N jobs (default: 50)
- `--evaluate N` — AI score top N fresh jobs (default: 5)
- `--query auto|<query>` — scan query (default: `auto` from profile target_roles)

**Output:** Text + HTML email via Resend, or console preview.

## html-report.mjs

Generate self-contained HTML dashboard.

```
node scripts/html-report.mjs
```

**Output:** `reports/tracker-dashboard.html` (offline, no external dependencies).

## doctor.mjs

Health check.

```
node scripts/doctor.mjs
```

Validates Node version, `.env` presence, config file syntax, and portal connectivity.
