# JobOps

JobOps is an AI job hunting agent that turns this CLI into a full job search command center.

## Quick Commands

- `/jobops find me remote software engineer jobs` — Scan job boards
- `/jobops evaluate this job: [paste JD]` — Deep 5-dimension evaluation
- `/jobops tailor my CV for job #3` — ATS-optimized CV + cover letter
- `/jobops show my tracker` — Application status
- `/jobops add follow-up for Acme "Send thank you email"` — Add follow-up reminder
- `/jobops export tracker` — Export as CSV

## How It Works

1. You type a request
2. JobOps routes to the right mode
3. Executes tools (scan, evaluate, tailor, track)
4. Presents results with scores and recommendations
5. You decide what to do next

## Files

| File | Purpose |
|------|---------|
| `config/profile.yml` | Your profile, skills, preferences |
| `config/cv.md` | Your base CV (markdown) |
| `config/portals.yml` | Job board configurations, blacklists, whitelists |
| `data/applications.md` | Application tracker |
| `src/cli/index.ts` | CLI entry point |
| `src/**/*.ts` | TypeScript source (Bun runtime) |
