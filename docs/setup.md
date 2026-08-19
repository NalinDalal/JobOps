# Setup

## Prerequisites

- [Node.js](https://nodejs.org) v18+
- [Cloudflare](https://dash.cloudflare.com/) account (free tier works for Workers AI)
- Optional: [Resend](https://resend.com) account for daily digest emails
- Optional: `pdftotext` from [poppler](https://poppler.freedesktop.org/) for ATS checks (macOS: `brew install poppler`)

## 1. Clone and install

```bash
git clone <your-repo-url>
cd JobOps
npm install
```

## 2. Environment

```bash
cp .env.example .env
```

Minimum required for core features:

```
CLOUDFLARE_API_KEY=your_api_key_here
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_MODEL=@cf/meta/llama-3.3-70b-instruct-fp8-fast
```

For daily digest emails, also add:

```
RESEND_API_KEY=re_your_api_key_here
MAIL_FROM=onboarding@resend.dev   # or your verified domain
MAIL_TO=your@email.com
```

Verify a domain in Resend before sending to addresses other than your own.

## 3. Candidate profile

Edit `config/profile.yml` with your details. This is the source of truth for all evaluations.

If you want multiple role configurations, add YAML presets in `config/profiles/` and set the active one via `config/profiles/active.json`:

```json
{ "slug": "backend_python" }
```

## 4. Base CV

Edit `config/cv.md` with your CV in markdown. The tailoring script reads this file and mirrors JD keywords into it.

## 5. Job boards

Edit `config/portals.yml` to enable/disable sources, configure company blacklists/whitelists, and add custom search queries.

## 6. Health check

```bash
npm run doctor
# or
node scripts/doctor.mjs
```

## 7. First scan

```bash
node scripts/scan.mjs "software engineer" "Remote"
node scripts/scan.mjs auto "Remote"   # uses target_roles from profile.yml
```

## 8. Evaluate a job

```bash
node scripts/evaluate.mjs '{"title":"Software Engineer","company":"Stripe","location":"Remote","description":"..."}'
```

## 9. Tailor CV

```bash
node scripts/tailor.mjs '{"title":"Software Engineer","company":"Stripe","location":"Remote","description":"..."}'
```

Outputs go to `output/`.

## 10. Track applications

```bash
node scripts/tracker.mjs add "Stripe" "Software Engineer"
node scripts/tracker.mjs update "Stripe" "Applied"
node scripts/tracker.mjs list
node scripts/tracker.mjs report
```

## 11. Daily digest

Preview:

```bash
node scripts/digest.mjs
```

Send email (also marks jobs as seen):

```bash
node scripts/digest.mjs --mode daily --max 15 --evaluate 5
```

Cron (GitHub Actions): `.github/workflows/daily-digest.yml` runs at `30 6 * * *` UTC (12:00 IST).

## 12. Advanced features

```bash
node scripts/rank.mjs "software engineer" "Remote"        # batch score all scraped jobs
node scripts/interview.mjs "Stripe" "Technical"           # interview prep pack
node scripts/upskill.mjs --query "software engineer"      # skill gap analysis
node scripts/salary.mjs "Software Engineer" "India"       # salary lookup
node scripts/tracker.mjs reset "profile"                  # reset tracker (requires confirmation)
```
