# Scan Mode

Search job boards for roles matching the user's profile.

## Trigger

User says: "find me jobs", "search for [role]", "look for [type] jobs"

## Steps

1. **Load profile** — Read `config/profile.yml` for skills, target roles, locations
2. **Run scanner** — Execute `node scripts/scan.mjs` with query parameters
3. **Present results** — Show top 10 matches as a numbered list

## Output Format

```
Found 47 matches. Top 10:

1. [4.2/5] Senior Software Engineer — Stripe (Remote)
   Skills match: React, Node.js, TypeScript | Applied: No
   https://stripe.com/jobs/...

2. [3.8/5] Full Stack Developer — Notion (San Francisco)
   Skills match: React, PostgreSQL | Applied: No
   https://notion.so/careers/...

...

Recommendations:
- #1, #4, #7 are strong matches (4.0+)
- #2, #5 are decent (3.5-3.9)
- #3, #6, #8, #9, #10 are weak (<3.5) — skip unless strategic
```

## Rules

- Always show scores prominently
- Flag weak matches explicitly
- Suggest which to evaluate in detail
- Never auto-apply to anything
