# Customization

## Profiles

JobOps supports multiple named role configurations in `config/profiles/`. Each preset is a YAML file that controls search queries, scoring context, location preferences, and outreach copy.

### Creating a preset

Copy `config/profile.example.yml` to `config/profiles/backend-python.yaml` and edit. Then activate it:

```bash
node -e "require('fs').writeFileSync('config/profiles/active.json', JSON.stringify({slug:'backend-python'}))"
```

Or edit `config/profiles/active.json` directly:

```json
{ "slug": "backend-python" }
```

### What a profile controls

- `target_roles` — merged into scan queries when using `auto`
- `target_locations` — preferred locations for evaluation context
- `skills` — used in evaluation prompts and digest outreach blurbs
- `preferences` — salary range, remote preference, company filters
- `outreach` — optional per-profile LinkedIn DM templates
- `autonomy_level` — `review-each` (attention queue) or `routine-auto` (direct to Saved)

### Backward compatibility

If `config/profiles/active.json` does not exist, the system falls back to `config/profile.yml`.

## Portals

Add or remove job boards in `config/portals.yml`.

```yaml
portals:
  - name: RemoteOK
    enabled: true
    type: api
```

Company career pages (Greenhouse, Lever, Ashby) are configured under their respective sections:

```yaml
greenhouse:
  boards:
    - name: Stripe
      slug: stripe
```

## Scoring

Jobs are scored 1-5 across 5 equal-weight dimensions by default:

- Role Fit
- Location Fit
- Growth Potential
- Compensation Fit
- Culture Fit

To change weights, edit the prompt in `scripts/evaluate.mjs` or extend the profile schema with a `scoring_weights` block.

## ATS checks

Tailor runs source-level ATS verification on generated markdown:

- Contact details (email, phone) must appear as literal text
- No fabricated skills (cross-checked against `config/cv.md`)
- Standard section headers present
- Single-column format enforced in prompt

## Salary data

Add local salary benchmarks as JSON in `data/salary/`. Each file should follow this structure:

```json
{
  "region": "India",
  "roles": [
    {
      "title": "Software Engineer",
      "min": 600000,
      "max": 1800000,
      "median": 1200000,
      "currency": "INR",
      "source": "levels.fyi"
    }
  ]
}
```

Multiple files are supported; the lookup script merges them and picks the best match by title substring.

## Interview prep

The interview prep pack reads the company and role from `data/applications.md`, then generates:

1. Company research summary
2. Likely questions for the stated stage
3. STAR-mapped answers from your base CV
4. Questions to ask the interviewer

## Skill gap analysis

Upskill compares your `config/profile.yml` skills against the top N scraped jobs and produces:

- A gap heatmap (present vs. missing skills)
- A prioritized learning plan with curated resources
- Time estimates per skill

## Autonomy levels

Set `autonomy_level` in your active profile:

- `review-each` — new tracker entries go to `Attention` queue. You must approve each before it becomes `Saved` or `Applied`.
- `routine-auto` — entries go directly to `Saved`. Use only if you fully trust the scoring and dedup.

Check current level:

```bash
node scripts/tracker.mjs autonomy
```

## Verified facts

`tailor.mjs` runs source-level verification on generated CVs:

- Contact details (email, phone, name) must appear in the output
- Quantified claims must exist in `config/cv.md`
- Skills must be present in the base CV
- Standard section headers must be present
- ATS-hostile patterns (tables, double-spacing) are flagged

This prevents the model from inventing experience or credentials you don't have.

## Attention queue

The attention queue is a dedicated buffer for applications that need human review before proceeding. It prevents accidental or premature applications.

```bash
node scripts/tracker.mjs attention   # show queue
node scripts/tracker.mjs update "Company" "Saved"   # approve and move to Saved
node scripts/tracker.mjs update "Company" "Applied" # approve and mark as Applied
```

## Outcome review

After recording outcomes, analyze patterns:

```bash
node scripts/tracker.mjs review
```

This prints:
- Outcome distribution
- Success patterns (companies/roles that got offers)
- Rejection patterns
- Targeting suggestions based on data
