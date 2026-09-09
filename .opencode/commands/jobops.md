---
name: jobops
description: AI job hunting agent — search, evaluate, tailor, track
arguments: prompt
user_invocable: true
---

# JobOps Command

Run `bun run src/cli/index.ts status` first to validate setup.

Then route the user's prompt to the correct mode:

- If it contains "find", "search", "scan" → Run `bun run src/cli/index.ts scan --query "query"`
- If it contains "evaluate", "score", "rate" → Run `bun run src/cli/index.ts evaluate --company "Company" --role "Role"`
- If it contains "tailor", "cv", "cover letter" → Run `bun run src/cli/index.ts tailor --company "Company" --role "Role"`
- If it contains "tracker", "show tracker", "show my tracker" → Run `bun run src/cli/index.ts tracker list`
- If it contains "add [company]" → Run `bun run src/cli/index.ts tracker add --company "Company" --role "Role"`
- If it contains "mark interview" → Run `bun run src/cli/index.ts tracker interview --company "Company" --stage "stage"`
- If it contains "record outcome" → Run `bun run src/cli/index.ts tracker outcome --company "Company" --outcome "result"`
- If it contains "follow-up" or "followup" → Run `bun run src/cli/index.ts tracker followup --company "Company" --note "note"`
- If it contains "export" → Run `bun run src/cli/index.ts tracker export`
- If it contains "digest" → Run `bun run src/cli/index.ts digest --mode preview`
- If it contains URL → Fetch it, extract job details, evaluate
- If it contains "profile", "setup" → Show config/profile.yml

Load context from config/profile.yml and config/cv.md before any operation.
