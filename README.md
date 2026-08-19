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
- Optional: `pdftotext` from [poppler](https://poppler.freedesktop.org/) for ATS checks (macOS: `brew install poppler`)

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd JobOps
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

# or scan for every target role in your profile automatically:
node scripts/scan.mjs auto "Remote"
```

`auto` reads `target_roles` from the active profile, merges them with `search_queries` from `config/portals.yml` (deduped), scans one query per entry, and merges + dedups results. The daily digest uses `auto` by default.

### 8. Evaluate a job

```bash
node scripts/evaluate.mjs '{"title":"Software Engineer","company":"Stripe","location":"Remote","description":"We are looking for a software engineer with experience in React, Node.js, and TypeScript..."}'
```

This returns a 5-dimension score and recommendation.

### 9. Tailor your CV

```bash
node scripts/tailor.mjs '{"title":"Software Engineer","company":"Stripe","location":"Remote","description":"We are looking for a software engineer with experience in React, Node.js, and TypeScript..."}'
```

Check `output/` for your tailored CV and cover letter. ATS source checks run automatically and warnings are printed if contact details or standard headers are missing.

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

### 11. Batch rank jobs

```bash
node scripts/rank.mjs "software engineer" "Remote" --limit 20 --min-score 3.5
```

Scans, evaluates all jobs, and returns a JSON array sorted by overall score descending.

### 12. Interview prep

```bash
node scripts/interview.mjs "Stripe" "Technical"
```

Generates a stage-specific prep pack: company overview, likely questions, STAR-mapped answers from your CV, and questions to ask the interviewer. Requires the company to exist in the tracker.

### 13. Skill gap analysis

```bash
node scripts/upskill.mjs --query "software engineer" --limit 20
```

Scrapes jobs, compares required skills against your profile, and produces a prioritized heatmap + learning plan with resources.

### 14. Salary lookup

```bash
node scripts/salary.mjs "Software Engineer" "India"
```

Looks up salary from local `data/salary/*.json` files. Add your own benchmarks following the schema in `docs/customization.md`.

### 15. Daily digest (optional push — GitHub Actions cron)

JobOps can email you a daily digest of fresh matches at **12:00 PM IST** — scan, dedup against previously seen jobs, AI-score the top candidates, and a LinkedIn outreach blurb per role with people-search URLs.

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
node scripts/digest.mjs --query "backend"        # custom scan query (default: auto from active profile)
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
2. **`digest-seen.json` expiry is automatic, not a human skip.** Jobs marked seen by the cron expire from future digests *without you ever looking at them*. This is accepted: scans are cheap and continuously surface new postings. For judgment calls on the same data, run the agent locally (`node scripts/scan.mjs auto`) — the database only affects the daily email.
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
node scripts/tracker.mjs reset profile
node scripts/tracker.mjs attention
node scripts/tracker.mjs review
node scripts/tracker.mjs autonomy

# Batch rank
node scripts/rank.mjs "software engineer" "Remote" --limit 20

# Interview prep
node scripts/interview.mjs "Stripe" "Technical"

# Skill gaps
node scripts/upskill.mjs --query "software engineer" --limit 20

# Salary lookup
node scripts/salary.mjs "Software Engineer" "India"

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
npm run rank
npm run interview
npm run upskill
npm run salary
npm run rank
npm run interview
npm run upskill
npm run salary
```

## Commands Reference

### Job Search

| Command | Description |
|---------|-------------|
| `node scripts/scan.mjs "query" ["location"]` | Search all enabled job boards. Use `auto` as query to scan every `target_role` from your active profile. Location filter is optional. |

### Job Evaluation

| Command | Description |
|---------|-------------|
| `node scripts/evaluate.mjs '{"title":"...","company":"...","location":"...","description":"..."}'` | Score a job using Cloudflare AI |

Returns 5 dimension scores (1-5 each), overall score, recommendation, analysis, and red flags.

### CV Tailoring

| Command | Description |
|---------|-------------|
| `node scripts/tailor.mjs '{"title":"...","company":"...","location":"...","description":"..."}'` | Generate tailored CV + cover letter |

Reads `config/cv.md` and the active profile. Outputs to `output/`. ATS source checks run automatically.

### Batch Ranking

| Command | Description |
|---------|-------------|
| `node scripts/rank.mjs "query" ["location"] [--limit N] [--min-score X]` | Scan all boards, evaluate every job, return ranked JSON shortlist |

### Interview Prep

| Command | Description |
|---------|-------------|
| `node scripts/interview.mjs "Company" ["stage"]` | Generate stage-specific interview prep pack from tracker entry |

### Skill Gap Analysis

| Command | Description |
|---------|-------------|
| `node scripts/upskill.mjs [--query "q"] [--limit N]` | Compare profile skills vs. scraped jobs, generate learning plan |

### Salary Lookup

| Command | Description |
|---------|-------------|
| `node scripts/salary.mjs "Title" ["Region"]` | Look up salary from local `data/salary/*.json` |

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
| `node scripts/tracker.mjs attention` | Show attention queue (applications awaiting review) |
| `node scripts/tracker.mjs review` | Outcome review: distribution, patterns, suggestions |
| `node scripts/tracker.mjs autonomy` | Show current autonomy level (`review-each` or `routine-auto`) |
| `node scripts/tracker.mjs reset <mode>` | Reset tracker (`profile`, `documents`, or `all`). Requires typing `RESET` to confirm. |

### Daily Digest

| Command | Description |
|---------|-------------|
| `node scripts/digest.mjs [--mode preview\|daily] [--max N] [--evaluate N] [--query "auto\|q"]` | Scan → dedup → score top N → outreach blurbs + LinkedIn URLs → email or preview |

### Health Check

| Command | Description |
|---------|-------------|
| `node scripts/doctor.mjs` | Validate prerequisites and configuration |

## Configuration Files

| File | Purpose |
|------|---------|
| `config/profile.yml` | Your candidate profile: skills, target roles, locations, preferences |
| `config/profiles/*.yaml` | Named role presets (search queries, outreach templates, preferences) |
| `config/profiles/active.json` | Which preset is currently active (`{"slug":"default"}`) |
| `config/profiles/*.yaml` | Named role presets (search queries, outreach templates, preferences, autonomy_level) |
| `config/cv.md` | Your base CV in markdown. Used as source for tailoring. |
| `config/portals.yml` | Job board configuration: sources, blacklists, whitelists, search queries |
| `data/salary/*.json` | Optional local salary benchmarks |
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
JobOps/
├── AGENTS.md                    # Agent instructions and capabilities
├── OPENCODE.md                  # OpenCode skill reference
├── package.json                 # NPM scripts
├── .env                         # Cloudflare credentials (git-ignored)
├── .env.example                 # Environment template
├── .opencode/
│   └── skills/jobops/SKILL.md   # Kilo/OpenCode skill registration
├── cli.mjs                      # CLI entry point
├── config/
│   ├── profile.yml              # Candidate profile (fallback)
│   ├── profile.example.yml      # Profile template
│   ├── cv.md                    # Base CV (markdown)
│   ├── portals.yml              # Job board config + filters
│   └── profiles/
│       ├── active.json          # Active preset slug
│       └── default.yaml         # Default role preset
├── scripts/
│   ├── scan.mjs                 # Multi-portal job scanner
│   ├── evaluate.mjs             # 5-dimension AI job evaluator
│   ├── tailor.mjs               # ATS-optimized CV + cover letter generator
│   ├── tracker.mjs              # Application tracker with interview/outcome/follow-up support
│   ├── rank.mjs                 # Batch scorer: scan → evaluate → ranked shortlist
│   ├── interview.mjs            # Interview prep pack generator
│   ├── upskill.mjs              # Skill gap analysis + learning plan
│   ├── salary.mjs               # Salary lookup from local data
│   ├── digest.mjs               # Daily digest: scan → dedup → AI score → outreach + LinkedIn URLs → email
│   ├── html-report.mjs          # Self-contained HTML dashboard generator
│   ├── doctor.mjs               # System health check
│   └── lib/
│       └── profile.mjs          # Shared active-profile loader
├── docs/
│   ├── architecture.md          # System architecture and data flow
│   ├── setup.md                 # Detailed setup guide
│   ├── api-reference.md         # Script interfaces and schemas
│   └── customization.md         # Profiles, portals, salary data, templates
├── .github/workflows/
│   └── daily-digest.yml         # Cron: digest email at 12:00 IST (Resend)
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
6. **Review** — Run `node scripts/tracker.mjs review` to analyze patterns and get targeting suggestions
7. **Follow-up** — Set reminders with notes, default +7 days
8. **Dashboard** — Open `reports/tracker-dashboard.html` to visualize pipeline

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
