# Tailor Mode

Generate ATS-optimized CV and cover letter for a specific job.

## Trigger

User says: "tailor my CV for [job]", "generate CV for this role", "create cover letter"

## Input

Either:
- Job title + company + description (from evaluation or paste)
- Reference to a previous evaluation (e.g., "tailor for the Stripe job")

## Steps

1. **Load base CV** — Read `config/cv.md`
2. **Load profile** — Read `config/profile.yml`
3. **Extract keywords** — Parse JD for required skills, tools, qualifications
4. **Rewrite CV** — Mirror JD keywords while keeping truth intact
5. **Generate cover letter** — Personal, role-specific, under 300 words

## ATS Optimization Rules

- Use exact keywords from JD (e.g., "React" not "React.js" if JD says "React")
- Quantify achievements (numbers, percentages, metrics)
- Use standard section headers (Experience, Skills, Education)
- Avoid tables, columns, images, headers/footers
- Single-column layout for ATS parsing

## CV Output Format

```markdown
# [Name]
[Phone] | [Email] | [LinkedIn] | [GitHub]

## Summary
[2-3 sentences highlighting relevant experience for THIS role]

## Skills
[Extracted from JD + your actual skills, ordered by relevance]

## Experience
[Same experience, rewritten to emphasize JD-relevant achievements]

## Projects
[Most relevant projects for this specific role]

## Education
[Unchanged]
```

## Cover Letter Format

```
Dear Hiring Manager,

[Opening: Why this role at this company — specific, not generic]
[Middle: 2-3 concrete examples matching JD requirements]
[Closing: Enthusiasm + call to action]

Best,
[Name]
```

## Rules

- Never fabricate experience — only reframe what exists
- Mirror keywords naturally, not stuffed
- Keep cover letter under 300 words
- Save outputs to `output/` directory
- Ask user to review before considering submission
