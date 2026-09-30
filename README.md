# JobOps — AI Job Hunting Agent

A local-first job hunting agent: **scan** job boards, **evaluate** fit with AI, **tailor** ATS-optimized CVs, and **track** every application. No auto-submit. No cloud lock-in. Everything runs on your machine.

## What It Does

```
1. SCAN     → Scan 8+ job boards and company career pages
2. EVALUATE → Score each job 1-5 across 5 AI dimensions
3. TAILOR   → Generate ATS-optimized CV + cover letter
4. TRACK    → Manage applications with interview stages, outcomes, follow-ups
5. DIGEST   → Daily email with fresh jobs + AI scores
```

## Quick Start

```bash
git clone <your-repo-url>
cd JobOps
bun install

# Configure environment
cp .env.example .env
# Edit .env with your Cloudflare credentials

# Scan for jobs
bun run index.ts scan --query "software engineer"

# Run daily digest
bun run index.ts digest --send
```

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

### 3. Create your profile

Edit `config/profile.yml` with your details:

```yaml
candidate:
  name: "Your Name"
  email: "your@email.com"
  github: "github.com/yourusername"
  linkedin: "linkedin.com/in/your-profile"

skills:
  languages:
    - TypeScript
    - Python
  frameworks:
    - React
    - Node.js
  databases:
    - PostgreSQL

target_roles:
  - Software Engineer
  - Full Stack Developer

target_locations:
  - India
  - Remote

experience:
  level: "Junior/Entry"
  years: "0-2"
```

### 4. Add your CV

Edit `config/cv.md` with your CV in markdown format. This is the base CV that gets tailored for each job.

### 5. Configure job boards

Edit `config/portals.yml` to enable/disable sources, configure blacklists/whitelists, and add custom search queries.

## CLI Commands

All commands are run via `bun run index.ts <command>`.

| Command | Description | Example |
|---------|-------------|---------|
| `digest` | Run daily job digest | `bun run index.ts digest --mode preview` |
| `evaluate` | Score a job via Cloudflare AI | `bun run index.ts evaluate --company "Acme" --role "Engineer"` |
| `tailor` | Generate ATS-optimized CV + cover letter | `bun run index.ts tailor --company "Acme" --role "Engineer"` |
| `tracker` | Manage application tracker | `bun run index.ts tracker list` |
| `scan` | Scan job boards | `bun run index.ts scan --query "react developer"` |
| `research` | Research accelerator companies | `bun run index.ts research --accelerator yc` |
| `outreach` | Generate outreach DM/email drafts | `bun run index.ts outreach --company "Acme" --role "Engineer"` |
| `status` | Show system configuration | `bun run index.ts status` |
| `help` | Show help | `bun run index.ts help` |

### Digest

Preview mode (prints to console, never writes seen state):
```bash
bun run index.ts digest
bun run index.ts digest --query "backend" --max 10
```

Daily mode (sends email, then marks jobs as seen):
```bash
bun run index.ts digest --mode daily --send
```

Options:
- `--mode preview|daily` — preview prints to console, daily sends email
- `--query "..."` — custom scan query (default: auto from profile)
- `--max N` — max jobs in digest (default: 50)
- `--evaluate N` — AI-score the N best-fitting jobs (default: 25)

The AI budget goes to the highest keyword-overlap candidates, not the first N
scanned. Jobs beyond the budget fall back to keyword scoring, which is capped
below the strong-match threshold — so a job outside the budget can never be
reported as a strong match. Raise `--evaluate` if your daily token ceiling
allows.
- `--mock` — use mock data

### Evaluate

```bash
bun run index.ts evaluate --company "Stripe" --role "Software Engineer"
```

### Tailor

```bash
bun run index.ts tailor --company "Acme" --role "Engineer"
bun run index.ts tailor --company "Acme" --role "Engineer" --description "JD text..."
```

Output goes to `output/`.

### Tracker

```bash
# List all applications
bun run index.ts tracker list

# Add application
bun run index.ts tracker add --company "Acme" --role "Engineer"

# Update status
bun run index.ts tracker update --company "Acme" --status "Applied"

# Record interview
bun run index.ts tracker interview --company "Acme" --stage "Technical"

# Record outcome
bun run index.ts tracker outcome --company "Acme" --outcome "Rejected"

# Add follow-up
bun run index.ts tracker followup --company "Acme" --note "Check status"

# Export CSV
bun run index.ts tracker export
```

### Scan

```bash
bun run index.ts scan --query "software engineer"
bun run index.ts scan auto    # uses target_roles from profile.yml
```

## Daily Digest Workflow

The daily digest runs automatically via GitHub Actions at 12:00 IST:

1. Scans job boards for new jobs
2. Filters out previously seen jobs
3. Evaluates top N jobs with Cloudflare AI
4. Ranks jobs by fit score
5. Renders HTML email with digest
6. Sends email via Resend or SMTP
7. Marks delivered jobs as seen (only after successful email)

If email delivery fails, the seen-job state is preserved — no jobs are lost.

## License

MIT
