# API Reference

## scan

Search job boards.

```bash
bun run src/cli/index.ts scan --query "software engineer"
```

**Output:** Job listings to stdout.

**Job object:**

```json
{
  "id": "company::title::url",
  "title": "Software Engineer",
  "company": "Stripe",
  "location": "Remote",
  "url": "https://...",
  "source": "greenhouse",
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
  "growth": 4.5,
  "compensationFit": 4.0,
  "cultureFit": 4.0,
  "verdict": "strong",
  "recommendation": "Strong Apply",
  "whyMatch": ["..."],
  "matchedSkills": ["..."],
  "redFlags": []
}
```

## tailor

Generate tailored CV + cover letter.

```bash
bun run src/cli/index.ts tailor --company "Stripe" --role "Software Engineer"
bun run src/cli/index.ts tailor --company "Stripe" --role "Software Engineer" --description "JD text..."
```

**Output:** Two files in `output/`:
- `{company}-{role}-cv-{date}.md`
- `{company}-{role}-cover-letter-{date}.md`

## tracker

Application tracker.

```bash
bun run src/cli/index.ts tracker list
bun run src/cli/index.ts tracker add --company "Company" --role "Role"
bun run src/cli/index.ts tracker update --company "Company" --status "Status"
bun run src/cli/index.ts tracker interview --company "Company" --stage "Stage"
bun run src/cli/index.ts tracker outcome --company "Company" --outcome "Result"
bun run src/cli/index.ts tracker followup --company "Company" --note "Note"
bun run src/cli/index.ts tracker export
```

**Valid statuses:** `Saved`, `Attention`, `Applied`, `Interviewing`, `Offer`, `Rejected`, `Withdrawn`

**Valid stages:** `Phone Screen`, `Technical`, `Onsite`, `Final Round`, `HR Round`, `Offer`, `Other`

**Valid outcomes:** `Applied`, `Interviewing`, `Offer Received`, `Offer Accepted`, `Offer Declined`, `Rejected`, `Ghosted`, `Withdrawn`

## digest

Daily digest.

```bash
bun run src/cli/index.ts digest [--mode preview|daily] [--max N] [--evaluate N] [--query "..."]
```

**Flags:**
- `--mode preview` — print to console only (default)
- `--mode daily` — email via Resend/SMTP, then mark jobs as seen
- `--max N` — cap digest to N jobs (default: 50)
- `--evaluate N` — AI score top N fresh jobs (default: 5)
- `--query "..."` — scan query (default: auto from profile target_roles)
- `--mock` — use mock data

**Behavior:**
- Preview mode never writes to `data/digest-seen.json`
- Daily mode writes fresh job IDs only after successful email delivery
- If email fails, seen-job state is preserved

## status

Show system configuration status.

```bash
bun run src/cli/index.ts status
```

Shows Cloudflare AI, Resend, and SMTP configuration status.
