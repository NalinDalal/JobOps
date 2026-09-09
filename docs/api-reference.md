# API Reference

## scan

Search job boards.

```bash
bun run src/cli/index.ts scan <query> <location>
bun run src/cli/index.ts scan auto <location>
```

**Output:** JSON array to stdout.

**Job object:**

```json
{
  "id": "company::title::url",
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

## evaluate

Score a single job via Cloudflare AI.

```bash
bun run src/cli/index.ts evaluate --company "Stripe" --role "Software Engineer"
```

**Output:** JSON evaluation object.

**JSON schema:**

```json
{
  "overall": 4.2,
  "roleFit": 4.5,
  "locationFit": 4.0,
  "growthPotential": 4.5,
  "compFit": 4.0,
  "cultureFit": 4.0,
  "verdict": "strong",
  "recommendation": "Strong Apply",
  "analysis": "...",
  "redFlags": []
}
```

## tailor

Generate tailored CV + cover letter.

```bash
bun run src/cli/index.ts tailor --company "Stripe" --role "Software Engineer"
```

**Output:** Two files in `output/`:
- `{company}-cv.md`
- `{company}-cover-letter.md`

## tracker

Application tracker.

```bash
bun run src/cli/index.ts tracker list
bun run src/cli/index.ts tracker add --company "Company" --role "Role"
bun run src/cli/index.ts tracker update --company "Company" --status "Status"
bun run src/cli/index.ts tracker interview --company "Company" --stage "Stage" ["date"]
bun run src/cli/index.ts tracker outcome --company "Company" --outcome "Result"
bun run src/cli/index.ts tracker followup --company "Company" --note "Note" ["date"]
bun run src/cli/index.ts tracker export
bun run src/cli/index.ts tracker report
```

**Valid statuses:** `Saved`, `Attention`, `Applied`, `Interviewing`, `Offer`, `Rejected`, `Withdrawn`

## digest

Daily digest.

```bash
bun run src/cli/index.ts digest [--mode preview|daily] [--max N] [--evaluate N] [--query "auto|<query>"]
```

**Flags:**
- `--mode preview` — print to console only (default)
- `--mode daily` — email via Resend + mark jobs as seen
- `--max N` — cap digest to N jobs (default: 50)
- `--evaluate N` — AI score top N fresh jobs (default: 5)
- `--query auto|<query>` — scan query (default: `auto` from profile target_roles)

**Output:** Text + HTML email via Resend, or console preview.

## status

System health check.

```bash
bun run src/cli/index.ts status
```

Validates Node version, `.env` presence, config file syntax, and portal connectivity.
