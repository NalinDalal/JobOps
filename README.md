# JobOps — AI Job Hunting Agent

An autonomous job hunting agent that combines the best of three open-source tools into one local-first pipeline: **scan** job boards, **evaluate** fit with AI across 5 dimensions, **tailor** ATS-optimized CVs and cover letters, and **track** every application with interview stages, outcomes, and follow-ups. No auto-submit. No cloud lock-in. Everything runs on your machine.

## What It Does

```
1. SEARCH    → Scan 8+ job boards and company career pages
2. EVALUATE  → Score each job 1-5 across 5 AI dimensions
3. TAILOR    → Generate ATS-optimized CV + cover letter
4. TRACK     → Manage applications with interview stages, outcomes, follow-ups
5. RANK      → Batch-score all scraped jobs into a ranked shortlist
6. PREP      → Generate interview prep packs from tracker entries
7. UPSKILL   → Analyze skill gaps and generate learning plans
8. DIGEST    → Daily email with fresh jobs + AI scores + LinkedIn outreach blurbs
```

## Features

| Feature | Description |
|---------|-------------|
| **8+ Job Sources** | RemoteOK, Arbeitnow, Findwork, Remotive, freehire, Greenhouse, Lever, Ashby |
| **Company Career Pages** | 14 Greenhouse boards (Stripe, Notion, Figma, Datadog, Ramp, Replit, ClickHouse, Hasura…), 13 Lever boards (Netflix, Shopify, Spotify, Mercury, PostHog, Vanta…), 6 Ashby boards (Anthropic, OpenAI, Mistral…) |
| **5-Dimension AI Scoring** | Role Fit, Location Fit, Growth Potential, Compensation Fit, Culture Fit + red flags |
| **Batch Scoring `/rank`** | Score all scraped jobs at once with deal-breaker vetoes and ranked output |
| **ATS-Optimized Tailoring** | Mirrors JD keywords into your CV, generates cover letters, source-level ATS verification |
| **Application Tracker** | Track status, interview stages, outcomes, follow-up dates and notes |
| **HTML Dashboard** | Self-contained offline dashboard with stats, searchable table, upcoming follow-ups |
| **Interview Prep Pack** | Stage-specific prep (STAR mapping, company research, likely questions) |
| **Skill Gap Analysis** | Compare profile vs. jobs, generate prioritized learning plans |
| **Salary Lookup** | Local JSON salary benchmarks by role and region |
| **Profile Presets** | Multiple named YAML presets controlling search, scoring, outreach — switch without code changes |
| **Daily Digest** | Scan → dedup → AI score top N → LinkedIn outreach blurbs + people-search URLs → email |
| **Company Filtering** | Blacklist and whitelist companies in portal config |
| **Location Preferences** | Positive/negative location keywords per profile |
| **Attention Queue** | `review-each` mode gates new applications behind human approval |
| **Outcome Review** | Analyze success/rejection patterns and get targeting suggestions |
| **Verified Facts** | CV claims cross-checked against `config/cv.md`; no invented experience |
| **Local-First** | All data stored locally. No accounts required. |

## Prerequisites

- [Node.js](https://nodejs.org) v18+
- [Cloudflare](https://dash.cloudflare.com/) account (free tier works for Workers AI)
- Optional: [Resend](https://resend.com) account for daily digest emails
- Optional: Gmail App Password for SMTP email (alternative to Resend)
- Optional: `pdftotext` from [poppler](https://poppler.freedesktop.org/) for ATS checks (macOS: `brew install poppler`)

## Quick Start (New: Master Resume → Profile → Companies → Daily Digest)

If you have a master resume (`config/resume.md`), you can generate everything in 3 commands:

```bash
# 1. Generate profile.yml from resume (one-time)
bun run src/cli/index.ts profile

# 2. Discover 15 target companies on Greenhouse/Lever/Ashby (one-time)
bun run src/cli/index.ts discover

# 3. Copy the output from step 2 into config/portals.yml under greenhouse/lever/ashby sections

# 4. Run daily digest (recurring — runs automatically via GitHub Actions at 12:00 IST)
bun run src/cli/index.ts digest --send
```

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd JobOps
bun install
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

For the daily email digest you also need a [Resend](https://resend.com) account **or** SMTP (Gmail App Password):

```
# Option A: Resend
RESEND_API_KEY=re_your_api_key_here
MAIL_FROM=onboarding@resend.dev   # or your verified domain
MAIL_TO=your@email.com

# Option B: SMTP (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your_16_char_app_password
MAIL_FROM=your-email@gmail.com
MAIL_TO=your-email@gmail.com
```

**Note:** before scheduled emails reach your inbox, verify a domain in Resend (Settings → Domains) and use it as `MAIL_FROM`, or use the `onboarding@resend.dev` sender for testing (it can only send to your own address).

### 3. Create your profile

**Option A: Auto-generate from master resume** (recommended)
```bash
bun run src/cli/index.ts profile --enrich   # also fetches GitHub/LeetCode/Codeforces stats
```
This reads `config/resume.md` and generates `config/profile.yml` using AI.

**Option B: Manual**
Edit `config/profile.yml` with your details (see template below).

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
  - Canada

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

location_preferences:
  positive:
    - India
    - Remote
  negative: []
```

For multiple role configurations, add YAML presets in `config/profiles/` and activate one by editing `config/profiles/active.json`:

```json
{ "slug": "backend_python" }
```

### 4. Add your CV

Edit `config/cv.md` with your CV in markdown format. This is the base CV that gets tailored for each job.

### 5. Configure job boards & search filters

Edit `config/portals.yml` to enable/disable sources, add company blacklists/whitelists, and configure search queries.

Edit `config/search.yml` to control what jobs to search for:
```yaml
include_titles:
  - Software Engineer
  - Full Stack
  - Backend
  # ...titles you want
exclude_titles:
  - Senior
  - Staff
  - Intern
  # ...titles to skip
locations:
  - India
  - Remote
  - US
  # ...locations you want
allow_remote: true
max_age_days: 30          # skip postings older than this
score_threshold: 3.5      # minimum AI score to include in digest
max_per_digest: 10        # max jobs per daily email
```

### 6. Discover target companies (one-time)

```bash
bun run src/cli/index.ts discover --count 15
```
This uses AI to find 15 companies hiring for your target roles on Greenhouse/Lever/Ashby. Copy the output into `config/portals.yml` under the appropriate `greenhouse.boards`, `lever.boards`, `ashby.boards` sections.

### 7. Run health check

```bash
bun run doctor
# or
bun run src/cli/index.ts status
```

### 8. Test with mock data

```bash
bun run src/cli/index.ts scan --mock
bun run src/cli/index.ts digest --mock
```

### 9. Run your first real scan

```bash
bun run src/cli/index.ts scan auto "Remote"

# or scan for a specific query
bun run src/cli/index.ts scan "software engineer" "Remote"
```

### 8. Evaluate a job

```bash
bun run src/cli/index.ts evaluate --company "Stripe" --role "Software Engineer"
```

This returns a 5-dimension score and recommendation.

### 9. Tailor your CV

```bash
bun run src/cli/index.ts tailor --company "Stripe" --role "Software Engineer"
```

Check `output/` for your tailored CV and cover letter. ATS source checks run automatically and warnings are printed if contact details or standard headers are missing.

### 10. Track applications

```bash
bun run src/cli/index.ts tracker add --company "Stripe" --role "Software Engineer"
bun run src/cli/index.ts tracker update --company "Stripe" --status "Applied"
bun run src/cli/index.ts tracker list
```

Generate the HTML dashboard:

```bash
bun run src/cli/index.ts tracker report
# or
bun run report
```

### 11. Batch rank jobs

```bash
bun run src/cli/index.ts scan "software engineer" "Remote" --evaluate 20
```

Scans, evaluates all jobs, and returns a JSON array sorted by overall score descending.

### 12. Interview prep

```bash
bun run src/cli/index.ts tracker interview --company "Stripe" --stage "Technical"
```

Generates a stage-specific prep pack: company overview, likely questions, STAR-mapped answers from your CV, and questions to ask the interviewer. Requires the company to exist in the tracker.

### 13. Skill gap analysis

```bash
bun run src/cli/index.ts scan --query "software engineer" --limit 20
```

Scrapes jobs, compares required skills against your profile, and produces a prioritized heatmap + learning plan with resources.

### 14. Salary lookup

```bash
bun run src/cli/index.ts scan "Software Engineer" "India"
```

Looks up salary from local `data/salary/*.json` files. Add your own benchmarks following the schema in `docs/customization.md`.

### Daily Digest (Push Mode — GitHub Actions Cron)

JobOps emails you a daily digest of fresh matches at **12:00 PM IST** — scan, dedup against previously seen jobs, AI-score the top candidates, and a LinkedIn outreach blurb per role with people-search URLs.

**Preview locally** (prints instead of emailing):
```bash
bun run src/cli/index.ts digest
# or
bun run digest
```

**Options:**
```bash
bun run src/cli/index.ts digest --mode daily          # email + mark jobs as seen (alias: --send)
bun run src/cli/index.ts digest --send                # same as --mode daily
bun run src/cli/index.ts digest --mock                # use mock data for testing
bun run src/cli/index.ts digest --max 10              # cap jobs in the email
bun run src/cli/index.ts digest --evaluate 0          # skip AI scoring (no Cloudflare keys)
bun run src/cli/index.ts digest --query "backend"     # custom scan query (default: auto from profile)
```

**Activate the scheduled email (needs GitHub):**
1. Push this repo to GitHub: `git push origin main`
2. Go to **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `CLOUDFLARE_API_KEY` — your Cloudflare API key (enables AI scoring in CI)
   - `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID
   - `RESEND_API_KEY` — your `re_...` key from Resend (or use SMTP secrets below)
   - `MAIL_FROM` — your verified sender (e.g. `digest@yourdomain.com`)
   - `MAIL_TO` — the address to receive digests
   - **OR** SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
3. The workflow `.github/workflows/daily-digest.yml` runs automatically at `30 6 * * *` UTC (**12:00 IST**). You can also trigger it manually: **Actions → Daily Job Digest → Run workflow**.

Freshness is tracked in `data/digest-seen.json` (cached across CI runs); already-seen jobs are never re-emailed.

### 16. Automation philosophy — who decides what

The system runs on a **three-way split of authority**:

> **Automation informs. The agent executes. The human approves.**

| Stage | Runs how | Decides what |
|---|---|---|
| Discovery (scan → dedup → top-N score → email) | Automatically, 12:00 IST cron | *What might be relevant* — a notification filter, nothing more |
| Evaluation, tailoring, tracking | On request, via the agent (JobOps skill) | *What it means* — deep scoring, CV variants, pipeline state |
| Applying, accepting, sending | Human only, manually | *What happens* — final call on every application |

Key implications:

1. **Push discovery, pull decisions.** The cron flipped the trigger from "ask the agent" to "the system notifies you" — but authority never moved. The automation has no judgment and no accountability; it can't tell you a JD is a stretch, it only scores and emails. Anything that changes your application state still requires you + the agent.
2. **`digest-seen.json` expiry is automatic, not a human skip.** Jobs marked seen by the cron expire from future digests *without you ever looking at them*. This is accepted: scans are cheap and continuously surface new postings. For judgment calls on the same data, run the agent locally (`bun run src/cli/index.ts scan auto`) — the database only affects the daily email.
3. **Deliberate non-goal: no unattended action stages.** Automating discovery was a conscious, reviewable line. Auto-tailoring on digest hits, auto-adding to the tracker, or auto-applying are *not* wired in and should only ever be added as an explicit design decision — never by accident. Rule #1 in [Rules](#rules) ("Never auto-submit applications") applies to every code path, including CI.

If the automation ever does more than *inform*, this section is the first thing to update.

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
rank jobs for "software engineer"
prepare interview for Stripe
analyze skill gaps
show attention queue
review my outcomes
check autonomy level
```

### Standalone Scripts

You can also run scripts directly without an agent CLI:

```bash
# Setup (one-time)
bun run src/cli/index.ts profile              # Generate profile.yml from resume.md
bun run src/cli/index.ts profile --enrich     # Also fetch GitHub/CP stats
bun run src/cli/index.ts discover             # Find 15 target companies on GH/Lever/Ashby

# Search jobs
bun run src/cli/index.ts scan "software engineer" "Remote"
bun run src/cli/index.ts scan auto            # Use profile target_roles
bun run src/cli/index.ts scan --mock          # Test with mock data

# Evaluate a job
bun run src/cli/index.ts evaluate '{"title":"Software Engineer","company":"Stripe","location":"Remote","description":"..."}'

# Tailor CV + cover letter
bun run src/cli/index.ts tailor '{"title":"Software Engineer","company":"Stripe","location":"Remote","description":"..."}'

# Track applications
bun run src/cli/index.ts tracker list
bun run src/cli/index.ts tracker add "Stripe" "Software Engineer"
bun run src/cli/index.ts tracker update "Stripe" "Applied"
bun run src/cli/index.ts tracker interview "Stripe" "Technical" "2025-01-15"
bun run src/cli/index.ts tracker outcome "Stripe" "Offer Received"
bun run src/cli/index.ts tracker followup "Stripe" "Send thank you email"
bun run src/cli/index.ts tracker export
bun run src/cli/index.ts tracker report
bun run src/cli/index.ts tracker reset profile
bun run src/cli/index.ts tracker attention
bun run src/cli/index.ts tracker review
bun run src/cli/index.ts tracker autonomy

# Batch rank
bun run src/cli/index.ts rank "software engineer" "Remote" --limit 20

# Interview prep
bun run src/cli/index.ts interview "Stripe" "Technical"

# Skill gaps
bun run src/cli/index.ts upskill --query "software engineer" --limit 20

# Salary lookup
bun run src/cli/index.ts salary "Software Engineer" "India"

# Daily digest
bun run src/cli/index.ts digest                       # Preview
bun run src/cli/index.ts digest --send                # Send email (marks seen)
bun run src/cli/index.ts digest --mock                # Test with mock data

# Health check
bun run src/cli/index.ts doctor
```

### NPM Scripts

```bash
bun run scan
bun run evaluate
bun run tailor
bun run tracker
bun run report
bun run digest
bun run doctor
bun run rank
bun run interview
bun run upskill
bun run salary
bun run discover
```

## Commands Reference

### Setup Commands (One-Time)

| Command | Description |
|---------|-------------|
| `bun run src/cli/index.ts profile` | Generate `profile.yml` from `config/resume.md` using AI |
| `bun run src/cli/index.ts profile --enrich` | Also fetch GitHub stats and LeetCode/Codeforces data |
| `bun run src/cli/index.ts discover [--count N]` | AI finds N target companies on Greenhouse/Lever/Ashby |

### Job Search

| Command | Description |
|---------|-------------|
| `bun run src/cli/index.ts scan "query" ["location"]` | Search all enabled job boards. Use `auto` as query to scan every `target_role` from your active profile. |
| `bun run src/cli/index.ts scan --mock` | Test with mock data (no API calls) |

### Job Evaluation

| Command | Description |
|---------|-------------|
| `bun run src/cli/index.ts evaluate '{"title":"...","company":"...","location":"...","description":"..."}'` | Score a job using Cloudflare AI |

Returns 5 dimension scores (1-5 each), overall score, recommendation, analysis, and red flags.

### CV Tailoring

| Command | Description |
|---------|-------------|
| `bun run src/cli/index.ts tailor '{"title":"...","company":"...","location":"...","description":"..."}'` | Generate tailored CV + cover letter |

Reads `config/cv.md` and the active profile. Outputs to `output/`. ATS source checks run automatically.

### Batch Ranking

| Command | Description |
|---------|-------------|
| `bun run src/cli/index.ts rank "query" ["location"] [--limit N] [--min-score X]` | Scan all boards, evaluate every job, return ranked JSON shortlist |

### Interview Prep

| Command | Description |
|---------|-------------|
| `bun run src/cli/index.ts interview "Company" ["stage"]` | Generate stage-specific interview prep pack from tracker entry |

### Skill Gap Analysis

| Command | Description |
|---------|-------------|
| `bun run src/cli/index.ts upskill [--query "q"] [--limit N]` | Compare profile skills vs. scraped jobs, generate learning plan |

### Salary Lookup

| Command | Description |
|---------|-------------|
| `bun run src/cli/index.ts salary "Title" ["Region"]` | Look up salary from local `data/salary/*.json` |

### Application Tracker

| Command | Description |
|---------|-------------|
| `bun run src/cli/index.ts tracker list` | Show all applications with status, score, interview stage, outcome |
| `bun run src/cli/index.ts tracker add "Company" "Role"` | Add new application |
| `bun run src/cli/index.ts tracker update "Company" "status"` | Update status (Saved, Applied, Interviewing, Offer, Rejected, Withdrawn) |
| `bun run src/cli/index.ts tracker interview "Company" "stage" ["date"]` | Add interview stage (Phone Screen, Technical, Onsite, Final Round, HR Round, Offer, Other) |
| `bun run src/cli/index.ts tracker outcome "Company" "result"` | Record final outcome (Applied, Interviewing, Offer Received, Offer Accepted, Offer Declined, Rejected, Ghosted, Withdrawn) |
| `bun run src/cli/index.ts tracker followup "Company" "note" ["date"]` | Add follow-up reminder (defaults to +7 days) |
| `bun run src/cli/index.ts tracker export` | Export tracker as CSV |
| `bun run src/cli/index.ts tracker report` | Generate self-contained HTML dashboard |
| `bun run src/cli/index.ts tracker attention` | Show attention queue (applications awaiting review) |
| `bun run src/cli/index.ts tracker review` | Outcome review: distribution, patterns, suggestions |
| `bun run src/cli/index.ts tracker autonomy` | Show current autonomy level (`review-each` or `routine-auto`) |
| `bun run src/cli/index.ts tracker reset <mode>` | Reset tracker (`profile`, `documents`, or `all`). Requires typing `RESET` to confirm. |

### Daily Digest

| Command | Description |
|---------|-------------|
| `bun run src/cli/index.ts digest [--mode preview\|daily] [--send] [--mock] [--max N] [--evaluate N] [--query "auto\|q"]` | Scan → dedup → score top N → outreach blurbs + LinkedIn URLs → email or preview |

### Direct Outreach (30-Day Challenge)

Direct outreach features are planned for a future TypeScript migration.

### Health Check

| Command | Description |
|---------|-------------|
| `bun run src/cli/index.ts status` | Validate prerequisites and configuration |

## Configuration Files

| File | Purpose |
|------|---------|
| `config/profile.yml` | Your candidate profile: skills, target roles, locations, preferences |
| `config/profile.example.yml` | Profile template |
| `config/resume.md` | **NEW** Master resume (superset) — source for `profile` command |
| `config/search.yml` | **NEW** Search filters: include/exclude titles, locations, remote, max_age_days, score_threshold, max_per_digest |
| `config/profiles/*.yaml` | Named role presets (search queries, outreach templates, preferences, autonomy_level) |
| `config/profiles/active.json` | Which preset is currently active (`{"slug":"default"}`) |
| `config/cv.md` | Your base CV in markdown. Used as source for tailoring. |
| `config/portals.yml` | Job board configuration: sources, blacklists, whitelists, search queries, company boards |
| `data/salary/*.json` | Optional local salary benchmarks |
| `.env` | Cloudflare + Resend/SMTP credentials (git-ignored; see `.env.example`) |
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
JobOps/
├── AGENTS.md                    # Agent instructions and capabilities
├── OPENCODE.md                  # OpenCode skill reference
├── package.json                 # NPM scripts
├── .env                         # Cloudflare credentials (git-ignored)
├── .env.example                 # Environment template
├── .opencode/
│   └── skills/jobops/SKILL.md   # Kilo/OpenCode skill registration
├── config/
│   ├── profile.yml              # Candidate profile (fallback)
│   ├── profile.example.yml      # Profile template
│   ├── resume.md                # Master resume (superset) — source for profile generation
│   ├── search.yml               # Search filters: titles, locations, remote, age, score
│   ├── cv.md                    # Base CV (markdown)
│   ├── portals.yml              # Job board config + filters + company boards
│   └── profiles/
│       ├── active.json          # Active preset slug
│       └── default.yaml         # Default role preset
├── src/
│   ├── cli/index.ts             # CLI entry point (Bun runtime)
│   ├── pipeline/
│   │   ├── scan.ts              # Multi-portal job scanner
│   │   ├── evaluate.ts          # 5-dimension AI job evaluator
│   │   └── rank.ts              # Rank and filter jobs
│   ├── tracker/index.ts         # Application tracker with interview/outcome/follow-up support
│   ├── digest/
│   │   ├── index.ts             # Digest exports
│   │   ├── mailer.ts            # Email delivery via Resend or SMTP
│   │   ├── renderer.ts          # HTML and text digest renderer
│   │   └── viewModel.ts         # Digest view model
│   ├── config/
│   │   ├── env.ts               # Environment configuration
│   │   ├── loader.ts            # YAML config loaders
│   │   └── schemas.ts           # Zod schemas for validation
│   ├── domain/                  # Domain types and logic
│   ├── lib/                     # Shared utilities
│   └── schemas/                 # Zod schemas
├── docs/
│   ├── architecture.md          # System architecture and data flow
│   ├── setup.md                 # Detailed setup guide
│   ├── api-reference.md         # CLI interfaces and schemas
│   └── customization.md         # Profiles, portals, salary data, templates
├── .github/workflows/
│   └── daily-digest.yml         # Cron: digest email at 12:00 IST (Resend/SMTP)
├── data/
│   ├── applications.md          # Application tracker data
│   ├── digest-seen.json         # Seen jobs for digest dedup
│   └── salary/
│       └── india-tech.json      # Local salary benchmarks
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
   evaluate.mjs → Sends job + active profile to Cloudflare AI
   ↓
   Returns 5-dimension scores (Role, Location, Growth, Comp, Culture)
   + red flags + recommendation

3. TAILOR
   tailor.mjs → Reads base CV + active profile, sends JD to Cloudflare AI
   ↓
   Generates ATS-optimized CV + cover letter in output/
   Runs source-level ATS checks (contact details, headers, no fabricated skills)

4. TRACK
   tracker.mjs → Manages application pipeline
   ↓
   Interview stages, outcomes, follow-ups, CSV export, HTML dashboard

5. RANK
   rank.mjs → Scans + batch-evaluates all jobs
   ↓
   Returns ranked JSON shortlist with deal-breaker vetoes

6. PREP
   interview.mjs → Reads tracker entry + base CV + company context
   ↓
   Generates STAR-mapped answers, likely questions, questions to ask

7. UPSKILL
   upskill.mjs → Scrapes jobs + reads active profile
   ↓
   Skill gap heatmap + prioritized learning plan with resources

8. DIGEST
   digest.mjs → Scan → dedup → score top N → outreach blurbs + LinkedIn URLs
   ↓
   Emails curated list or prints preview to console
```

## Tracking Workflow

1. **Save** — Add interesting jobs to tracker before applying
2. **Attention** — In `review-each` mode, jobs land in Attention queue first; approve to move to Saved
3. **Apply** — Mark as Applied when submitted
4. **Interview** — Record each interview stage as it happens
5. **Outcome** — Log final result: Offer, Rejected, Ghosted, etc.
6. **Review** — Run `bun run src/cli/index.ts tracker list` to analyze patterns and get targeting suggestions
7. **Follow-up** — Set reminders with notes, default +7 days
8. **Dashboard** — Open `reports/tracker-dashboard.html` to visualize pipeline

## HTML Dashboard

Generate a self-contained offline dashboard:

```bash
bun run report
# or
bun run src/cli/index.ts tracker report
```

Opens `reports/tracker-dashboard.html` with:
- Application stats (total, interviews, offers, rejected, ghosted)
- Upcoming follow-ups table
- Searchable/filterable applications table
- Status distribution bars
- No external dependencies — works fully offline

## Evaluation Dimensions

Each job is scored 1-5 across 5 equal-weight dimensions:

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

## Direct Outreach Strategy

The most effective way to land interviews is NOT applying on job boards. It's:

1. **Find companies** via ATS boards (less competitive than LinkedIn)
2. **Verify the job is real** before spending time on it
3. **Find CTO/EM emails** (Apollo.io, Hunter.io, pattern guessing)
4. **Email 2 people directly** — short, specific, mention the role
5. **Follow up once** after 4-5 days — low key bump
6. **Do this 10x/day for 30 days** = 300 direct outreach

### ATS Boards to Search

- `site:jobs.ashbyhq.com` — Ashby
- `site:boards.greenhouse.io` — Greenhouse
- `site:jobs.lever.co` — Lever
- `site:careers.icims.com` — iCIMS
- `site:jobs.jobvite.com` — Jobvite
- `site:wd1.myworkdayjobs.com` — Workday
- `site:jobs.bamboohr.com` — BambooHR
- `site:jobs.smartrecruiters.com` — SmartRecruiters
- `site:apply.jazz.co` — JazzHR
- `site:careers.workable.com` — Workable

### Email Template Structure

1. Hook (5s): "Hey [Name], I noticed [Company] does X..."
2. Problem (15s): "I saw you're dealing with Y..."
3. Solution (20s): "I built a quick prototype that..."
4. CTA (10s): "Would love to show you how it works..."

### Key Insight

Startup roles rarely get posted publicly. If you want them, you gotta go where they are — Wellfound, direct outreach, and company career pages.

## Rules

1. **Never auto-submit applications** — always present for user review
2. **Score honestly** — jobs below 3.5/5 are weak matches
3. **Use real data** — run the scripts, don't make up results
4. **Mirror keywords** — CV tailoring extracts JD keywords into your experience
5. **Local-first** — everything runs on your machine

## Documentation

| Doc | What's in it |
|------|-------------|
| `docs/architecture.md` | System architecture, data flow, script ownership |
| `docs/setup.md` | Detailed setup: profiles, portals, credentials, digest |
| `docs/api-reference.md` | Script interfaces, input/output schemas |
| `docs/customization.md` | Profiles, portals, salary data, interview prep, upskill, reset |

## License

MIT

## Built From

Inspired by and combining features from:

- [AI Job Search](https://github.com/MadsLorentzen/ai-job-search) — 5-dimension scoring, drafter-reviewer CV pipeline, interview prep, HTML dashboard, portal skill system
- [Job Hunter](https://github.com/replyre/job-hunter) — Multi-source scanning, email digests, company career pages, profile presets, LinkedIn outreach blurbs, configurable scoring weights
- [Job Application Agent](https://github.com/vaibhavarora14/job-application-agent) — Attention queue, application dedup, outcome review loop, autonomy levels, verified-facts enforcement
- [Auto Job Applier LinkedIn](https://github.com/GodsScion/Auto_job_applier_linkedIn) — LinkedIn Easy Apply automation, question answering, stealth mode
