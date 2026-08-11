# Evaluate Mode

Deep evaluation of a single job against the user's profile.

## Trigger

User says: "evaluate this job", "how good is this role", "score this JD", "evaluate job #N"

## Input

Either:
- Paste a job description (full text)
- Reference a job number from scan results (e.g., "evaluate job #3")
- Provide a URL to a job posting

## Steps

1. **Load profile** — Read `config/profile.yml` and `config/cv.md`
2. **Parse JD** — Extract requirements, skills, location, seniority, tech stack
3. **Score** — Rate across 5 dimensions (1-5 each, equal weight):
   - Role Fit — Skills match, seniority alignment
   - Location Fit — Remote/on-site match preference
   - Growth Potential — Career trajectory, learning potential
   - Compensation Fit — Salary range vs expectations
   - Culture Fit — Company values, team size, mission
4. **Calculate** — Average of 5 dimensions = overall score
5. **Red flags** — Identify potential concerns
6. **Recommend** — Strong Apply (4.0+), Review (3.5-3.9), Maybe (3.0-3.4), Skip (<3.0)

## Output Format

```
## Evaluation: Senior Software Engineer at Stripe

**Overall Score: 4.2/5.0** → Strong Apply

### Dimension Scores
| Dimension | Score |
|-----------|-------|
| Role Fit | 4.5/5 |
| Location | 4.0/5 |
| Growth | 4.5/5 |
| Compensation | 4.0/5 |
| Culture | 4.0/5 |

### Analysis
Strong match on skills: React, Node.js, TypeScript all align with your experience.
Remote-friendly matches your preference. Senior role aligns with your 2+ years experience.

### Recommendation
Apply. This is a strong match on skills and culture. The remote option and growth potential make this worth pursuing.

### Red Flags
- None identified
```

## Rules

- Be honest about weak scores
- Never inflate ratings
- Always provide actionable next steps
- Save evaluation to `reports/`
- Flag red flags explicitly, even if minor
