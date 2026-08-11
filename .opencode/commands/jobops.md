---
name: jobops
description: AI job hunting agent — search, evaluate, tailor, track
arguments: prompt
user_invocable: true
---

# JobOps Command

Run `node scripts/doctor.mjs` first to validate setup.

Then route the user's prompt to the correct mode:

- If it contains "find", "search", "scan" → Run `node scripts/scan.mjs "query" ["location"]`
- If it contains "evaluate", "score", "rate" → Run `node scripts/evaluate.mjs '{job data}'`
- If it contains "tailor", "cv", "cover letter" → Run `node scripts/tailor.mjs '{job data}'`
- If it contains "tracker", "show tracker", "show my tracker" → Run `node scripts/tracker.mjs list`
- If it contains "mark interview" → Run `node scripts/tracker.mjs interview "Company" "stage" ["date"]`
- If it contains "record outcome" → Run `node scripts/tracker.mjs outcome "Company" "result"`
- If it contains "follow-up" or "followup" → Run `node scripts/tracker.mjs followup "Company" "note" ["date"]`
- If it contains "export" → Run `node scripts/tracker.mjs export`
- If it contains "report" or "dashboard" → Run `node scripts/tracker.mjs report` or `node scripts/html-report.mjs`
- If it contains "add [company]" → Run `node scripts/tracker.mjs add "Company" "Role"`
- If it contains URL → Fetch it, extract job details, evaluate
- If it contains "profile", "setup" → Show config/profile.yml

Load context from config/profile.yml and config/cv.md before any operation.
