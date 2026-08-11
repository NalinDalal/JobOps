# Tracker Mode

Manage application statuses and track progress.

## Trigger

User says: "show my tracker", "what have I applied to?", "update application status", "show tracker report"

## Data Source

`data/applications.md` — Markdown table with all applications.

## Display Format

```
## Application Tracker

| # | Company | Role | Status | Applied | Score | Last Update | Interview Stage | Outcome | Follow-up Date | Follow-up Note |
|---|---------|------|--------|---------|-------|-------------|-----------------|---------|----------------|----------------|
| 1 | Stripe | Senior SWE | Interviewing | 2026-01-15 | 4.2 | 2026-01-20 | Technical | — | 2026-01-27 | Send follow-up email |
| 2 | Notion | Full Stack | Applied | 2026-01-18 | 3.8 | 2026-01-18 | — | — | — | — |
| 3 | Vercel | Sr. Engineer | Rejected | 2026-01-10 | 4.0 | 2026-01-25 | — | Rejected | — | — |
| 4 | Linear | SWE | Saved | — | 3.5 | — | — | — | — | — |

### Summary
- Total: 4 applications
- Interviewing: 1 (25%)
- Applied: 1 (25%)
- Rejected: 1 (25%)
- Saved: 1 (25%)

### Upcoming Follow-ups
- [2026-01-27] Stripe: Send follow-up email

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
| "mark interview for [company]" | Add interview stage (Phone Screen, Technical, Onsite, Final Round, HR Round, Offer, Other) |
| "record outcome for [company]" | Record final outcome (Offer Received, Offer Accepted, Offer Declined, Rejected, Ghosted, Withdrawn) |
| "add follow-up for [company]" | Add follow-up reminder with note |
| "show tracker report" | Generate self-contained HTML dashboard |
| "export tracker" | Export as CSV |
| "show rejected" | Filter by status |

## Status Values

- `Saved` — Found but not yet applied
- `Applied` — Application submitted
- `Interviewing` — In interview process
- `Offer` — Received offer
- `Rejected` — Not selected
- `Withdrawn` — User withdrew application

## Interview Stages

- Phone Screen
- Technical
- Onsite
- Final Round
- HR Round
- Offer
- Other

## Outcomes

- Applied
- Interviewing
- Offer Received
- Offer Accepted
- Offer Declined
- Rejected
- Ghosted
- Withdrawn

## Rules

- Never mark as "Applied" without explicit user confirmation
- Always show last update date
- Flag stale applications (>14 days without update)
- Default follow-up date is +7 days from today
