# Setup

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Cloudflare](https://dash.cloudflare.com/) account (free tier works for Workers AI)
- Optional: [Resend](https://resend.com) account for daily digest emails

## 1. Clone and install

```bash
git clone <your-repo-url>
cd JobOps
bun install
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
bun run src/cli/index.ts status
```

## 7. First scan

```bash
bun run src/cli/index.ts scan --query "software engineer"
```

## 8. Evaluate a job

```bash
bun run src/cli/index.ts evaluate --company "Stripe" --role "Software Engineer"
```

## 9. Tailor CV

```bash
bun run src/cli/index.ts tailor --company "Stripe" --role "Software Engineer"
```

Outputs go to `output/`.

## 10. Track applications

```bash
bun run src/cli/index.ts tracker add --company "Stripe" --role "Software Engineer"
bun run src/cli/index.ts tracker update --company "Stripe" --status "Applied"
bun run src/cli/index.ts tracker list
```

## 11. Daily digest

Preview:

```bash
bun run src/cli/index.ts digest
```

Send email (marks jobs as seen only after successful delivery):

```bash
bun run src/cli/index.ts digest --mode daily --send
```

Cron (GitHub Actions): `.github/workflows/daily-digest.yml` runs at `30 6 * * *` UTC (12:00 IST).
