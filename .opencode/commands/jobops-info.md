# JobOps

JobOps is an AI job hunting agent that turns this CLI into a full job search command center.

## Quick Commands

- `/jobops find me remote software engineer jobs` — Scan + evaluate
- `/jobops evaluate this job: [paste JD]` — Deep evaluation
- `/jobops tailor my CV for job #3` — ATS-optimized CV
- `/jobops show my tracker` — Application status
- `/jobops setup profile` — Interactive profile setup
- `/jobops research [company]` — Company research

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
| `config/portals.yml` | Job board configurations |
| `data/applications.md` | Application tracker |
| `modes/*.md` | Workflow definitions |
| `scripts/*.mjs` | Executable tools |
