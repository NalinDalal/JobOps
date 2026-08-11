# Scan Mode

Search job boards for roles matching the user's profile.

## Trigger

User says: "find me jobs", "search for [role]", "look for [type] jobs", "scan for [role]"

## Steps

1. **Load profile** — Read `config/profile.yml` for skills, target roles, locations
2. **Load portal config** — Read `config/portals.yml` for enabled sources, blacklist/whitelist, search queries
3. **Run scanner** — Execute `node scripts/scan.mjs "query" "location"`
4. **Present results** — Show matches as a numbered list with scores

## Output Format

```
Found 47 matches. Top 10:

1. [4.2/5] Senior Software Engineer — Stripe (Remote)
   Skills match: React, Node.js, TypeScript | Applied: No
   Source: greenhouse:stripe | https://stripe.com/jobs/...

2. [3.8/5] Full Stack Developer — Notion (San Francisco)
   Skills match: React, PostgreSQL | Applied: No
   Source: greenhouse:notion | https://notion.so/careers/...

...

Recommendations:
- #1, #4, #7 are strong matches (4.0+)
- #2, #5 are decent (3.5-3.9)
- #3, #6, #8, #9, #10 are weak (<3.5) — skip unless strategic
```

## Sources

Scans all enabled sources from `config/portals.yml`:
- RemoteOK, Arbeitnow, Findwork, Remotive, freehire
- Greenhouse boards (Stripe, Notion, Figma, Datadog, Cloudflare, Supabase, Vercel, Linear, Railway, Retool)
- Lever boards (Netflix, Shopify, Spotify, Reddit, Twitch, Slack, Pinterest, Lyft)
- Ashby boards (Anthropic, OpenAI, Cohere, Mistral, Hugging Face, Scale AI)

## Rules

- Always show source for each job
- Respect blacklist/whitelist from portals.yml
- Flag weak matches explicitly
- Suggest which to evaluate in detail
- Never auto-apply to anything
- Deduplicate by title+company before presenting
