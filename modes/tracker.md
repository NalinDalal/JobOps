# Tracker Mode

Manage application statuses and track progress.

## Trigger

User says: "show my tracker", "what have I applied to?", "update application status"

## Data Source

`data/applications.md` — Markdown table with all applications.

## Display Format

```
## Application Tracker

| # | Company | Role | Status | Applied | Score | Last Update |
|---|---------|------|--------|---------|-------|-------------|
| 1 | Stripe | Senior SWE | Interviewing | 2026-01-15 | 4.2 | 2026-01-20 |
| 2 | Notion | Full Stack | Applied | 2026-01-18 | 3.8 | 2026-01-18 |
| 3 | Vercel | Sr. Engineer | Rejected | 2026-01-10 | 4.0 | 2026-01-25 |
| 4 | Linear | SWE | Saved | — | 3.5 | — |

### Summary
- Total: 4 applications
- Interviewing: 1 (25%)
- Applied: 1 (25%)
- Rejected: 1 (25%)
- Saved: 1 (25%)

### Next Steps
- Follow up with Notion (applied 7 days ago)
- Prepare for Stripe interview
- Apply to Linear (score 3.5 — review first)
```

## Commands

| User says | Action |
|-----------|--------|
| "add [company] to tracker" | Add new entry |
| "update [company] to [status]" | Change status |
| "show rejected" | Filter by status |
| "export tracker" | Generate CSV |

## Status Values

- `Saved` — Found but not yet applied
- `Applied` — Application submitted
- `Interviewing` — In interview process
- `Offer` — Received offer
- `Rejected` — Not selected
- `Withdrawn` — User withdrew application

## Rules

- Never mark as "Applied" without explicit user confirmation
- Always show last update date
- Flag stale applications (>14 days without update)
