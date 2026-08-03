# JobOps — AI Job Hunting Agent

An autonomous job hunting agent powered by OpenCode. Search job boards, evaluate fit, tailor CVs with AI, and track applications — all from your terminal.

## Prerequisites

- [Node.js](https://nodejs.org) (v18+)
- [OpenCode](https://opencode.ai) CLI
- Cloudflare account (free tier works)

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

### 3. Configure your profile

Edit `config/profile.yml` with your details:

```yaml
name: Your Name
email: your@email.com
phone: "+91 XXXXXXXXXX"
target_roles:
  - Software Engineer
  - Full Stack Developer
  - Backend Developer
preferred_locations:
  - India
  - Remote
  - Bangalore
  - Bhopal
skills:
  languages: [TypeScript, Python, JavaScript]
  frameworks: [React, Node.js, Next.js]
```

### 4. Add your CV

Edit `config/cv.md` with your CV in markdown format.

## Usage

### Start OpenCode

```bash
cd career-apply-jobs
opencode
```

### Commands

| Command | What it does |
|---------|--------------|
| `find me remote software engineer jobs` | Search job boards |
| `evaluate job #1` | Score a job 1-5 using AI |
| `tailor my CV for job #1` | Generate tailored CV + cover letter |
| `show tracker` | View application status |
| `add [company] [role]` | Add job to tracker |

### Standalone scripts

You can also run scripts directly without OpenCode:

```bash
# Search jobs
node scripts/scan.mjs "software engineer"

# Evaluate a job
node scripts/evaluate.mjs '{"title":"Software Engineer","company":"Acme","location":"Remote","description":"..."}'

# Tailor CV
node scripts/tailor.mjs '{"title":"Software Engineer","company":"Acme","description":"..."}'

# Track applications
node scripts/tracker.mjs list
node scripts/tracker.mjs add "Acme" "Software Engineer"
node scripts/tracker.mjs update "Acme" "Applied"

# Health check
node scripts/doctor.mjs
```

## Project Structure

```
career-apply-jobs/
├── AGENTS.md                    # OpenCode instructions
├── .opencode/
│   ├── skills/jobops/SKILL.md   # Skill registration
│   └── commands/jobops.md       # Command registration
├── scripts/
│   ├── scan.mjs                 # Job board scanner
│   ├── evaluate.mjs             # AI job evaluator
│   ├── tailor.mjs               # CV + cover letter generator
│   ├── tracker.mjs              # Application tracker
│   └── doctor.mjs               # Health check
├── config/
│   ├── profile.yml              # Your skills & preferences
│   ├── cv.md                    # Your base CV
│   └── portals.yml              # Portal configuration
├── data/applications.md         # Application tracker
├── output/                      # Generated CVs & cover letters
└── reports/                     # Job evaluations
```

## Job Boards

Currently supported:
- **RemoteOK** — Remote jobs worldwide
- **Arbeitnow** — Remote jobs (EU focus)
- **Findwork** — Remote tech jobs

## How It Works

```
1. SEARCH    → scan.mjs fetches jobs from multiple boards
2. EVALUATE  → evaluate.mjs scores jobs using Cloudflare AI
3. TAILOR    → tailor.mjs generates ATS-optimized CV + cover letter
4. TRACK     → tracker.mjs manages your application pipeline
```

## License

MIT
