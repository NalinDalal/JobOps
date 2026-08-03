# Evaluate Mode

Deep evaluation of a single job against the user's profile.

## Trigger

User says: "evaluate this job", "how good is this role", "score this JD"

## Input

Either:
- Paste a job description (full text)
- Reference a job number from scan results (e.g., "evaluate job #3")
- Provide a URL to a job posting

## Steps

1. **Load profile** — Read `config/profile.yml` and `config/cv.md`
2. **Parse JD** — Extract requirements, skills, location, seniority, tech stack
3. **Score** — Rate across 5 dimensions (1-5):
   - Role Fit (30%) — Skills match, seniority alignment
   - Location (20%) — Remote/on-site match preference
   - Growth (20%) — Career trajectory, learning potential
   - Comp (15%) — Salary range vs expectations
   - Culture (15%) — Company values, team size, mission
4. **Calculate** — Weighted average = final score
5. **Recommend** — Apply (4.0+), Review (3.5-3.9), Skip (<3.5)

## Output Format

```
## Evaluation: Senior Software Engineer at Stripe

**Overall Score: 4.2/5.0** → Apply

### Dimension Scores
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Role Fit | 4.5 | 30% | 1.35 |
| Location | 4.0 | 20% | 0.80 |
| Growth | 4.5 | 20% | 0.90 |
| Comp | 3.5 | 15% | 0.53 |
| Culture | 4.0 | 15% | 0.60 |
| **Total** | | | **4.18** |

### Analysis
- Strong match on skills: React, Node.js, TypeScript all align with your experience
- Remote-friendly matches your preference
- Senior role aligns with your 2+ years experience
- Comp is competitive for the market

### Action Items
1. Tailor CV to emphasize React/TypeScript projects
2. Research Stripe's engineering culture
3. Prepare system design questions

### Recommendation
Apply. This is a strong match on skills and culture. The remote option and growth potential make this worth pursuing.
```

## Rules

- Be honest about weak scores
- Never inflate ratings
- Always provide actionable next steps
- Save evaluation to `reports/` if user wants
