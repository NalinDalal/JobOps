---
name: jobops
description: AI job hunting agent — search, evaluate, tailor, track
arguments: prompt
user_invocable: true
---

# JobOps Command

Run `node scripts/doctor.mjs` first to validate setup.

Then route the user's prompt to the correct mode:

- If it contains "find", "search", "scan" → Run `node scripts/scan.mjs`
- If it contains "evaluate", "score", "rate" → Run `node scripts/evaluate.mjs`
- If it contains "tailor", "cv", "cover letter" → Run `node scripts/tailor.mjs`
- If it contains "tracker", "applied", "status" → Run `node scripts/tracker.mjs`
- If it contains "profile", "setup" → Show config/profile.yml
- If it contains URL → Fetch it, extract job details

Load context from config/profile.yml and config/cv.md before any operation.
