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

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Cloudflare](https://dash.cloudflare.com/) account (free tier works for Workers AI)
- Optional: [Resend](https://resend.com) account for daily digest emails
- Optional: Gmail App Password for SMTP email (alternative to Resend)

## Quick Start

```bash
git clone <your-repo-url>
cd JobOps
bun install

# Configure environment
cp .env.example .env
# Edit .env with your Cloudflare credentials

# Scan for jobs
bun run src/cli/index.ts scan --query "software engineer"

# Run daily digest
bun run src/cli/index.ts digest --send
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

All commands are run via `bun run src/cli/index.ts <command>`.

| Command | Description | Example |
|---------|-------------|---------|
| `digest` | Run daily job digest | `bun run src/cli/index.ts digest --mode preview` |
| `evaluate` | Score a job via Cloudflare AI | `bun run src/cli/index.ts evaluate --company "Acme" --role "Engineer"` |
| `tailor` | Generate ATS-optimized CV + cover letter | `bun run src/cli/index.ts tailor --company "Acme" --role "Engineer"` |
| `tracker` | Manage application tracker | `bun run src/cli/index.ts tracker list` |
| `scan` | Scan job boards | `bun run src/cli/index.ts scan --query "react developer"` |
| `status` | Show system configuration | `bun run src/cli/index.ts status` |
| `help` | Show help | `bun run src/cli/index.ts help` |

### Digest

Preview mode (prints to console, never writes seen state):
```bash
bun run src/cli/index.ts digest
bun run src/cli/index.ts digest --query "backend" --max 10
```

Daily mode (sends email, then marks jobs as seen):
```bash
bun run src/cli/index.ts digest --mode daily --send
```

Options:
- `--mode preview|daily` — preview prints to console, daily sends email
- `--query "..."` — custom scan query (default: auto from profile)
- `--max N` — max jobs in digest (default: 50)
- `--evaluate N` — evaluate top N jobs with AI (default: 5)
- `--mock` — use mock data

### Evaluate

```bash
bun run src/cli/index.ts evaluate --company "Stripe" --role "Software Engineer"
```

### Tailor

```bash
bun run src/cli/index.ts tailor --company "Acme" --role "Engineer"
bun run src/cli/index.ts tailor --company "Acme" --role "Engineer" --description "JD text..."
```

Output goes to `output/`.

### Tracker

```bash
# List all applications
bun run src/cli/index.ts tracker list

# Add application
bun run src/cli/index.ts tracker add --company "Acme" --role "Engineer"

# Update status
bun run src/cli/index.ts tracker update --company "Acme" --status "Applied"

# Record interview
bun run src/cli/index.ts tracker interview --company "Acme" --stage "Technical"

# Record outcome
bun run src/cli/index.ts tracker outcome --company "Acme" --outcome "Rejected"

# Add follow-up
bun run src/cli/index.ts tracker followup --company "Acme" --note "Check status"

# Export CSV
bun run src/cli/index.ts tracker export
```

### Scan

```bash
bun run src/cli/index.ts scan --query "software engineer"
bun run src/cli/index.ts scan auto    # uses target_roles from profile.yml
```

## Architecture

```
src/
├── cli/index.ts          — CLI entry point (only process.argv parsing)
├── digest.ts             — Digest orchestration (importable, no side effects)
├── digest/
│   ├── viewModel.ts      — Builds DigestViewModel from jobs
│   ├── renderer.ts       — Renders HTML and text email
│   └── mailer.ts         — Sends via Resend or SMTP
├── pipeline/
│   ├── scan.ts           — Multi-portal job scanner
│   ├── dedup.ts          — Job deduplication
│   ├── evaluate.ts       — Cloudflare AI evaluation
│   └── rank.ts           — Job ranking and filtering
├── tailor/index.ts       — CV + cover letter generation
├── tracker/index.ts      — Application tracker
├── domain/               — TypeScript domain types
├── schemas/              — Zod validation schemas
├── config/               — Environment and YAML config loading
└── lib/                  — Shared utilities (constants, text, profile)
```

## Design Principles

1. **Local-first** — all data stored locally, no accounts required
2. **No auto-submit** — human review required before any application action
3. **No cloud lock-in** — runs entirely on your machine
4. **Typed boundaries** — Zod schemas validate all external data
5. **Importable modules** — no module-level side effects

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
