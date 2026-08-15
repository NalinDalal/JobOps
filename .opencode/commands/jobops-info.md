# JobOps

JobOps is an AI job hunting agent that turns this CLI into a full job search command center.

## Quick Commands

- `/jobops find me remote software engineer jobs` — Scan 8+ boards + evaluate
- `/jobops evaluate this job: [paste JD]` — Deep 5-dimension evaluation
- `/jobops tailor my CV for job #3` — ATS-optimized CV + cover letter
- `/jobops show my tracker` — Application status with interview stages and outcomes
- `/jobops mark interview for Acme "Technical"` — Record interview stage
- `/jobops record outcome for Acme "Offer Received"` — Record final outcome
- `/jobops add follow-up for Acme "Send thank you email"` — Add follow-up reminder
- `/jobops export tracker` — Export as CSV
- `/jobops show tracker report` — Generate HTML dashboard
- `/jobops setup profile` — View/edit profile

## How It Works

1. You type a request
2. JobOps routes to the right mode
3. Executes tools (search, evaluate, tailor, track)
4. Presents results with scores and recommendations
5. You decide what to do next

## Files

| File | Purpose |
|------|---------|
| `config/profile.yml` | Your profile, skills, preferences |
| `config/cv.md` | Your base CV (markdown) |
| `config/portals.yml` | Job board configurations, blacklists, whitelists |
| `data/applications.md` | Application tracker |
| `modes/*.md` | Workflow definitions |
| `scripts/*.mjs` | Executable tools |
