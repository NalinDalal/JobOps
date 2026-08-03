# Profile Mode

Interactive profile setup and management.

## Trigger

User says: "setup my profile", "what's my profile?", "update my skills"

## Profile Structure

```yaml
candidate:
  name: "Nalin Dalal"
  email: "nalindalal2004@gmail.com"
  phone: "+91 7440620675"
  location: "Bhopal, India"
  linkedin: "linkedin.com/in/nalin-dalal/"
  github: "github.com/NalinDalal"

skills:
  languages: ["C++", "TypeScript", "JavaScript", "Rust", "SQL"]
  frameworks: ["React", "Next.js", "Node.js", "Tailwind CSS"]
  databases: ["PostgreSQL", "Prisma", "MongoDB"]
  devops: ["Docker", "Kubernetes", "AWS", "Vercel"]
  tools: ["Git", "Neovim", "LazyGit"]

target_roles:
  - "Software Engineer"
  - "Full Stack Developer"
  - "Backend Engineer"

target_locations:
  - "India"
  - "Remote"
  - "US"
  - "Europe"
  - "Canada"

experience:
  level: "Junior/Entry"
  years: "0-2"
  open_source: true

preferences:
  remote: true
  salary_range: "Negotiable"
  company_size: "Any"
  company_type: ["Startup", "Mid-size", "Big Tech"]
```

## Commands

| User says | Action |
|-----------|--------|
| "what's my profile?" | Show current profile |
| "update my skills to [...]" | Update specific field |
| "add [skill] to my profile" | Append to skills list |
| "set target role to [role]" | Update target roles |
| "set location preference to [loc]" | Update locations |

## Rules

- Read from `config/profile.yml`
- Never auto-modify without asking
- Show what changed after each update
- Validate email, phone, URLs format
