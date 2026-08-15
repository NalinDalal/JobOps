# JobOps — AI Job Hunting Agent

An autonomous job hunting agent that combines the best of three open-source tools into one local-first pipeline: **scan** job boards, **evaluate** fit with AI across 5 dimensions, **tailor** ATS-optimized CVs and cover letters, and **track** every application with interview stages, outcomes, and follow-ups. No auto-submit. No cloud lock-in. Everything runs on your machine.

## What It Does

```
1. SEARCH    → Scan 8+ job boards and company career pages
2. EVALUATE  → Score each job 1-5 across 5 AI dimensions
3. TAILOR    → Generate ATS-optimized CV + cover letter
4. TRACK     → Manage applications with interview stages, outcomes, follow-ups
```

## Features

| Feature | Description |
|---------|-------------|
| **8+ Job Sources** | RemoteOK, Arbeitnow, Findwork, Remotive, freehire, Greenhouse, Lever, Ashby |
| **Company Career Pages** | 14 Greenhouse boards (Stripe, Notion, Figma, Datadog, Ramp, Replit, ClickHouse, Hasura…), 13 Lever boards (Netflix, Shopify, Spotify, Mercury, PostHog, Vanta…), 6 Ashby boards (Anthropic, OpenAI, Mistral…) |
| **5-Dimension AI Scoring** | Role Fit, Location Fit, Growth Potential, Compensation Fit, Culture Fit + red flags |
| **ATS-Optimized Tailoring** | Mirrors JD keywords into your CV, generates cover letters |
| **Application Tracker** | Track status, interview stages, outcomes, follow-up dates and notes |
| **HTML Dashboard** | Self-contained offline dashboard with stats, searchable table, upcoming follow-ups |
| **Company Filtering** | Blacklist and whitelist companies in portal config |
| **Local-First** | All data stored locally. No accounts required. |

## Prerequisites

- [Node.js](https://nodejs.org) v18+
- [Cloudflare](https://dash.cloudflare.com/) account (free tier works for Workers AI)
- Optional: [OpenCode](https://opencode.ai) or [Kilo](https://kilo.ai) CLI for agent mode

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd career-apply-jobs
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your Cloudflare credentials:

```
CLOUDFLARE_API_KEY=your_api_key_here
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_MODEL=@cf/meta/llama-3.3-70b-instruct-fp8-fast
```

Get free credentials at [Cloudflare Workers AI](https://dash.cloudflare.com/).

For the daily email digest you also need a [Resend](https://resend.com) account:

```
RESEND_API_KEY=re_your_api_key_here
MAIL_FROM=onboarding@resend.dev   # or your verified domain
MAIL_TO=your@email.com
```

**Note:** before scheduled emails reach your inbox, verify a domain in Resend (Settings → Domains) and use it as `MAIL_FROM`, or use the `onboarding@resend.dev` sender for testing (it can only send to your own address).

### 3. Configure your profile

Edit `config/profile.yml` with your details:

```yaml
candidate:
  name: "Your Name"
  email: "your@email.com"
  phone: "+91 XXXXXXXXXX"
  location: "City, Country"
  linkedin: "linkedin.com/in/your-profile"
  github: "github.com/yourusername"

skills:
  languages:
    - TypeScript
    - Python
    - JavaScript
  frameworks:
    - React
    - Node.js
    - Next.js
  databases:
    - PostgreSQL
    - MongoDB
  devops:
    - Docker
    - AWS
    - Vercel
  tools:
    - Git
    - Neovim

target_roles:
  - Software Engineer
  - Full Stack Developer
  - Backend Engineer

target_locations:
  - India
  - Remote
  - US
  - Europe

experience:
  level: "Junior/Entry"
  years: "0-2"
  open_source: true
  competitive_programming: true

preferences:
  remote: true
  salary_range: "Negotiable"
  company_size: "Any"
  company_type:
    - Startup
    - Mid-size
    - Big Tech
```

### 4. Add your CV

Edit `config/cv.md` with your CV in markdown format. This is the base CV that gets tailored for each job.

### 5. Configure job boards

Edit `config/portals.yml` to enable/disable sources, add company blacklists/whitelists, and configure search queries.

### 6. Run health check

```bash
npm run doctor
# or
node scripts/doctor.mjs
```

### 7. Run your first scan

```bash
node scripts/scan.mjs "software engineer" "Remote"
```

You should see JSON output with matching jobs from multiple boards.

### 8. Evaluate a job

```bash
node scripts/evaluate.mjs '{"title":"Software Engineer","company":"Stripe","location":"Remote","description":"We are looking for a software engineer with experience in React, Node.js, and TypeScript..."}'
```

This returns a 5-dimension score and recommendation.

### 9. Tailor your CV

```bash
node scripts/tailor.mjs '{"title":"Software Engineer","company":"Stripe","location":"Remote","description":"We are looking for a software engineer with experience in React, Node.js, and TypeScript..."}'
```

Check `output/` for your tailored CV and cover letter.

### 10. Track applications

```bash
node scripts/tracker.mjs add "Stripe" "Software Engineer"
node scripts/tracker.mjs update "Stripe" "Applied"
node scripts/tracker.mjs list
```

Generate the HTML dashboard:

```bash
node scripts/tracker.mjs report
# or
npm run report
```

### 11. Daily digest (optional push — GitHub Actions cron)

JobOps can email you a daily digest of fresh matches at **12:00 PM IST** — scan, dedup against previously seen jobs, AI-score the top candidates, and a LinkedIn outreach blurb per role.

**Preview locally** (prints instead of emailing):

```bash
node scripts/digest.mjs
# or
npm run digest
```

Flags:

```bash
node scripts/digest.mjs --mode daily             # email + mark jobs as seen
node scripts/digest.mjs --max 10                 # cap jobs in the email
node scripts/digest.mjs --evaluate 0             # skip AI scoring (no Cloudflare keys)
node scripts/digest.mjs --query "backend"        # custom scan query
```

**Activate the scheduled email (needs GitHub):**

1. Push this repo to GitHub: `git push origin main`
2. Go to **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `RESEND_API_KEY` — your `re_...` key from Resend
   - `MAIL_FROM` — your verified sender (e.g. `digest@yourdomain.com`)
   - `MAIL_TO` — the address to receive digests
   - `CLOUDFLARE_API_KEY` *(optional)* — enables AI scoring in CI
   - `CLOUDFLARE_ACCOUNT_ID` *(optional)* — enables AI scoring in CI
3. The workflow `.github/workflows/daily-digest.yml` runs automatically at `30 6 * * *` UTC (**12:00 IST**). You can also trigger it manually: **Actions → Daily Job Digest → Run workflow**.

Freshness is tracked in `data/digest-seen.json` (cached across CI runs); already-seen jobs are never re-emailed.

## Usage

### Agent Mode (OpenCode / Kilo)

Start your AI agent CLI in the project directory:

```bash
opencode
# or
kilo
```

Then use natural language:

```
find me remote software engineer jobs
evaluate job #1
tailor my CV for job #1
show my tracker
add to tracker
mark interview for Acme "Technical" "2025-01-15"
record outcome for Acme "Offer Received"
add follow-up for Acme "Sent thank you email"
export tracker
```

### Standalone Scripts

You can also run scripts directly without an agent CLI:

```bash
# Search jobs
node scripts/scan.mjs "software engineer" "Remote"

# Evaluate a job
node scripts/evaluate.mjs '{"title":"Software Engineer","company":"Stripe","location":"Remote","description":"..."}'

# Tailor CV + cover letter
node scripts/tailor.mjs '{"title":"Software Engineer","company":"Stripe","location":"Remote","description":"..."}'

# Track applications
node scripts/tracker.mjs list
node scripts/tracker.mjs add "Stripe" "Software Engineer"
node scripts/tracker.mjs update "Stripe" "Applied"
node scripts/tracker.mjs interview "Stripe" "Technical" "2025-01-15"
node scripts/tracker.mjs outcome "Stripe" "Offer Received"
node scripts/tracker.mjs followup "Stripe" "Send thank you email"
node scripts/tracker.mjs export
node scripts/tracker.mjs report

# Health check
node scripts/doctor.mjs
```

### NPM Scripts

```bash
npm run scan
npm run evaluate
npm run tailor
npm run tracker
npm run report
npm run digest
npm run doctor
```

## Commands Reference

### Job Search

| Command | Description |
|---------|-------------|
| `node scripts/scan.mjs "query" ["location"]` | Search all enabled job boards. Location filter is optional. |

### Job Evaluation

| Command | Description |
|---------|-------------|
| `node scripts/evaluate.mjs '{"title":"...","company":"...","location":"...","description":"..."}'` | Score a job using Cloudflare AI |

Returns 5 dimension scores (1-5 each), overall score, recommendation, analysis, and red flags.

### CV Tailoring

| Command | Description |
|---------|-------------|
| `node scripts/tailor.mjs '{"title":"...","company":"...","location":"...","description":"..."}'` | Generate tailored CV + cover letter |

Reads `config/cv.md` and `config/profile.yml`. Outputs to `output/`.

### Application Tracker

| Command | Description |
|---------|-------------|
| `node scripts/tracker.mjs list` | Show all applications with status, score, interview stage, outcome |
| `node scripts/tracker.mjs add "Company" "Role"` | Add new application |
| `node scripts/tracker.mjs update "Company" "status"` | Update status (Saved, Applied, Interviewing, Offer, Rejected, Withdrawn) |
| `node scripts/tracker.mjs interview "Company" "stage" ["date"]` | Add interview stage (Phone Screen, Technical, Onsite, Final Round, HR Round, Offer, Other) |
| `node scripts/tracker.mjs outcome "Company" "result"` | Record final outcome (Applied, Interviewing, Offer Received, Offer Accepted, Offer Declined, Rejected, Ghosted, Withdrawn) |
| `node scripts/tracker.mjs followup "Company" "note" ["date"]` | Add follow-up reminder (defaults to +7 days) |
| `node scripts/tracker.mjs export` | Export tracker as CSV |
| `node scripts/tracker.mjs report` | Generate self-contained HTML dashboard |

### Health Check

| Command | Description |
|---------|-------------|
| `node scripts/doctor.mjs` | Validate prerequisites and configuration |

## Configuration Files

| File | Purpose |
|------|---------|
| `config/profile.yml` | Your candidate profile: skills, target roles, locations, preferences |
| `config/cv.md` | Your base CV in markdown. Used as source for tailoring. |
| `config/portals.yml` | Job board configuration: sources, blacklists, whitelists, search queries |
| `config/companies.yml` | Company whitelist/blacklist with career pages |
| `.env` | Cloudflare + Resend credentials (git-ignored; see `.env.example`) |
| `data/digest-seen.json` | Seen-jobs database for the daily digest (git-ignored) |

## Job Boards

### Aggregators & APIs

| Source | Type | Description |
|--------|------|-------------|
| RemoteOK | API | Remote jobs worldwide |
| Arbeitnow | API | Remote jobs (EU focus) |
| Findwork | API | Remote tech jobs |
| Remotive | API | Remote jobs worldwide |
| freehire | API | Tech-focused jobs, multi-market |

### Company Career Pages

| Provider | Companies |
|----------|-----------|
| Greenhouse | Stripe, Notion, Figma, Datadog, Cloudflare, Supabase, Vercel, Linear, Railway, Retool, Ramp, Replit, ClickHouse, Hasura |
| Lever | Netflix, Shopify, Spotify, Reddit, Twitch, Slack, Pinterest, Lyft, Mercury, PostHog, Vanta, Puzzle, Sourcegraph |
| Ashby | Anthropic, OpenAI, Cohere, Mistral, Hugging Face, Scale AI |

Configure additional boards in `config/portals.yml`.

## Company Filtering

`config/portals.yml` supports both blacklist and whitelist modes:

```yaml
# Skip jobs from these companies
blacklist:
  enabled: true
  companies: []

# ONLY scan jobs from these companies (overrides blacklist)
whitelist:
  enabled: false
  companies: []
```

## Project Structure

```
career-apply-jobs/
├── AGENTS.md                    # Agent instructions and capabilities
├── OPENCODE.md                  # OpenCode skill reference
├── package.json                 # NPM scripts
├── .env                         # Cloudflare credentials (git-ignored)
├── .env.example                 # Environment template
├── .opencode/
│   └── skills/jobops/SKILL.md   # Kilo/OpenCode skill registration
├── config/
│   ├── profile.yml              # Candidate profile
│   ├── profile.example.yml      # Profile template
│   ├── cv.md                    # Base CV (markdown)
│   ├── portals.yml              # Job board config + filters
│   └── companies.yml            # Company whitelist/blacklist
├── scripts/
│   ├── scan.mjs                 # Multi-portal job scanner
│   ├── evaluate.mjs             # 5-dimension AI job evaluator
│   ├── tailor.mjs               # ATS-optimized CV + cover letter generator
│   ├── tracker.mjs              # Application tracker with interview/outcome/follow-up support
│   ├── digest.mjs               # Daily digest: scan → dedup → AI score → outreach blurb → email
│   ├── html-report.mjs          # Self-contained HTML dashboard generator
│   └── doctor.mjs               # System health check
├── .github/workflows/
│   └── daily-digest.yml         # Cron: digest email at 12:00 IST (Resend)
├── data/
│   └── applications.md          # Application tracker data
├── output/                      # Generated tailored CVs and cover letters
└── reports/                     # Evaluation reports and HTML dashboard
```

## How It Works

```
1. SEARCH
   scan.mjs → Fetches jobs from 8+ boards and company APIs
   ↓
   Deduplicates, filters by location and company blacklist/whitelist

2. EVALUATE
   evaluate.mjs → Sends job + profile to Cloudflare AI
   ↓
   Returns 5-dimension scores (Role, Location, Growth, Comp, Culture)
   + red flags + recommendation

3. TAILOR
   tailor.mjs → Reads base CV + profile, sends JD to Cloudflare AI
   ↓
   Generates ATS-optimized CV + cover letter in output/

4. TRACK
   tracker.mjs → Manages application pipeline
   ↓
   Interview stages, outcomes, follow-ups, CSV export, HTML dashboard
```

## Tracking Workflow

1. **Save** — Add interesting jobs to tracker before applying
2. **Apply** — Mark as Applied when submitted
3. **Interview** — Record each interview stage as it happens
4. **Outcome** — Log final result: Offer, Rejected, Ghosted, etc.
5. **Follow-up** — Set reminders with notes, default +7 days
6. **Review** — Open `reports/tracker-dashboard.html` to visualize pipeline

## HTML Dashboard

Generate a self-contained offline dashboard:

```bash
npm run report
# or
node scripts/html-report.mjs
```

Opens `reports/tracker-dashboard.html` with:
- Application stats (total, interviews, offers, rejected, ghosted)
- Upcoming follow-ups table
- Searchable/filterable applications table
- Status distribution bars
- No external dependencies — works fully offline

## Evaluation Dimensions

Each job is scored 1-5 across 5 dimensions:

| Dimension | What It Measures |
|-----------|-----------------|
| Role Fit | Skills match, experience alignment, title relevance |
| Location Fit | Remote compatibility, timezone, relocation needs |
| Growth Potential | Career trajectory, learning opportunities, team quality |
| Compensation Fit | Market rate alignment, benefits, equity |
| Culture Fit | Work-life balance, tech stack, mission, company stage |

**Verdict thresholds:**
- `≥ 4.0` → Strong Apply
- `≥ 3.5` → Review
- `≥ 3.0` → Maybe
- `< 3.0` → Skip

## Rules

1. **Never auto-submit applications** — always present for user review
2. **Score honestly** — jobs below 3.5/5 are weak matches
3. **Use real data** — run the scripts, don't make up results
4. **Mirror keywords** — CV tailoring extracts JD keywords into your experience
5. **Local-first** — everything runs on your machine

## License

MIT

## Built From

Inspired by and combining features from:

- [Auto Job Applier LinkedIn](https://github.com/GodsScion/Auto_job_applier_linkedIn) — LinkedIn Easy Apply automation, question answering, stealth mode
- [AI Job Search](https://github.com/MadsLorentzen/ai-job-search) — 5-dimension scoring, LaTeX CV compilation, interview prep, HTML dashboard
- [Job Hunter](https://github.com/replyre/job-hunter) — Multi-source scanning, email digests, company career pages, profile switching
