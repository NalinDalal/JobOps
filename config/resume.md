# NALIN DALAL — MASTER RESUME (source of truth)

> **How to use this file:** This is the superset. Every bullet, every project, every skill you've ever touched. Never submit this as-is — copy the relevant sections into your `.tex` template for each application, picking bullets that match the JD's keywords. Sections are ordered roughly by "how often you'll need this" for your current dev-tooling/infra-leaning search.

+91 7440620675 | nalindalal2004@gmail.com | [LinkedIn](https://www.linkedin.com/in/nalin-dalal/) | [GitHub](https://github.com/NalinDalal) | [LeetCode](https://leetcode.com/Nalindalal2004/) | [Codeforces](https://codeforces.com/profile/nalindalal2004) | [Portfolio](https://nalin.nerdev.in)

---

## Profile Summary — variants

**Full-stack + infra (default, current .tex):**
Full-Stack & Systems Engineer specialized in TypeScript, Node.js, Rust, and distributed systems. Architected and deployed production-grade microservices handling 15,000+ active users using Bun, Next.js, PostgreSQL, Kafka, and AWS (ECR/ECS). Experienced in building high-throughput event pipelines, low-latency WebSocket engines, and open-source infrastructure tools from scratch with a proven track record in competitive programming.

**Systems/infra-heavy (for Rivet, dev-tooling, low-level roles):**
Systems engineer who builds infrastructure from first principles — Redis clones, L7 load balancers, TCP event loops, a POSIX shell, JSON parsers, BPE tokenizers — alongside production TypeScript/Rust services shipping to 15,000+ users. Comfortable at every layer of the stack, from raw sockets to Kafka-backed event pipelines to React frontends. Active open-source contributor (merged PRs to p5.js, AsyncAPI) and Rust/Solana builder.

**Open-source maintainer angle (for community/OSS-first companies):**
Open-source maintainer and contributor with a track record of shipping merged PRs to established projects (p5.js, AsyncAPI), running CI/review pipelines for 30+ contributors as a university OSS maintainer, and building infra tools in public. Full-stack production experience (Next.js/TypeScript/PostgreSQL) paired with systems fundamentals in Rust and C++.

**Quant/HFT-leaning (if pursuing that track):**
CS engineer with competitive-programming depth (550+ LeetCode, 830+ Codeforces) and systems background in Rust/C++ — TCP event loops, custom in-memory stores, order-book implementation (superdev-fellow-classes). Interested in low-latency infra and market microstructure; building an options-trading project (TypeScript backend) as a parallel exploration track.

---

## Education
- **Oriental Institute of Science & Technology**, Bhopal, MP — B.Tech CSE, 2022–2026
- **Macro Vision Academy**, Burhanpur, MP — Senior Secondary (CBSE), 2022

## Certifications
- Python Essentials 1 & 2 — Cisco Networking Academy (Jun 2025)

---

## Full Skills Inventory (granular — trim per JD)

**Languages:** TypeScript, JavaScript, C++, Rust, SQL, Solidity, Bash, Python

**Frameworks & APIs:** Node.js, Express, Next.js, React, Elysia.js, Bun, REST APIs, WebSockets, Tailwind CSS

**Data & Messaging:** PostgreSQL, Prisma ORM, Apache Kafka, Redis, MongoDB, Elasticsearch

**DevOps & Cloud:** Docker, AWS (ECR/ECS), CI/CD (GitHub Actions), Kubernetes, Terraform, Prometheus

**Dev Tools:** Git, Jest, Neovim, LazyGit, Linux/Unix Shell, dotfiles/terminal environment tuning (yazi, etc.)

**Systems/Low-level (use when JD wants "fundamentals"):** TCP/socket programming, event loops, custom in-memory KV store (Redis clone), L7 load balancer, POSIX-compliant shell, JSON parser from scratch, BPE tokenizer implementation

**Web3/Rust track:** Solana program development, Rust CEX/orderbook implementation (superdev-fellow-classes cohort work)

**ML/AI exposure (light — don't lead with this unless JD asks):** RNN/LSTM implementation from scratch, transformer fundamentals, coursework notes on scaling laws, fine-tuning, MCP-style agent wrapping — mostly self-study (`ai` repo), not production ML work. Be honest about depth here if asked.

---

## Experience (full detail — more bullets than the trimmed .tex)

### DEBUG (University Tech Society) — Bhopal, MP
**Open Source Maintainer** · Jul 2024 – Jun 2026
- Managed GitHub organization repositories and onboarded 30+ open-source contributors, establishing automated CI workflows and code review pipelines that reduced PR review turnaround time by 40%.
- Engineered community tools and internal society dashboards using Next.js, TypeScript, and PostgreSQL, enhancing real-time member participation across university events.
- (Extra, use if JD wants leadership/mentoring angle) Acted as a point of contact for new contributors navigating their first PRs — effectively an informal mentorship role alongside maintenance.

### Headstarter — Remote
**Software Engineer Fellow** · Aug 2024 – Oct 2024
- Engineered full-stack web applications leveraging React, Node.js, and PostgreSQL, implementing high-throughput REST APIs handling complex data transformations.
- Optimized database queries and API response times by 35% through multi-level Redis caching and optimized execution plans in Prisma ORM.

### GSSoC (GirlScript Summer of Code) — Remote
**Open Source Contributor** · May 2024 – Oct 2024
- Authored and merged production-ready pull requests across 5+ open-source repositories, resolving critical concurrency bugs and refactoring legacy backend controllers.
- Decoupled monolithic server components into modular middleware routines, improving test coverage by 25% using Jest.

---

## Projects — full list

### Modheshwari — TypeScript, Next.js, PostgreSQL, Kafka, Redis, Docker, AWS · Jun 2024 – Aug 2026
- Architected a scalable, multi-service community engine sustaining 15,000+ active members with sub-100ms API response latency.
- Designed a multi-stage approval workflow engine in Prisma & PostgreSQL, handling stateful transitions for resource allocations and event management.
- Engineered an asynchronous notification pipeline using Apache Kafka as an event backbone and Redis Pub/Sub for real-time fanout, isolating background job processing from primary HTTP requests.
- Built a low-latency WebSocket microservice enabling real-time messaging, typing indicators, and read receipts with automated state recovery and connection heartbeat.
- Established end-to-end CI/CD via GitHub Actions, deploying containerized services (9-container Docker stack) to AWS ECR/ECS monitored with Prometheus.

### Blind — Anonymous Social Platform — Next.js, PostgreSQL, Prisma, Tailwind CSS · Sep 2025 – Oct 2025
- Developed an anonymous social posting web app with automated content moderation pipelines to filter toxic input in real time.
- Implemented cursor-based pagination and optimized indexing strategies in PostgreSQL, decreasing initial page load speed by 50% under heavy feed iteration.

### CoDraw — TypeScript, React, Node.js, WebSockets, Monorepo · Jun 2026 – Aug 2026
- Built a real-time collaborative whiteboarding tool supporting synchronous multi-user canvas drawing via bidirectional WebSocket protocol.
- Structured architecture as a monorepo, enforcing shared type safety and state sync across frontend canvas rendering and backend room managers.
- Implemented cross-tab clipboard sharing via BroadcastChannel (nice detail for "attention to UX/browser API depth").

### options-trading — TypeScript backend
- Exploratory project building backend infrastructure for options trading (order handling, backend service in `apps/be`). Use as evidence of interest in quant/trading infra track — frame honestly as in-progress/learning project unless it's further along than what's public.

### superdev-fellow-classes — Rust
- Coursework/cohort project implementing a CEX-style orderbook in Rust (`orderbook.rs`) as part of a Solana/Web3 fellowship track — solid evidence for the Rust + Solana line in your summary.

### Systems utilities (Rust/C++) — "30+ CLI and infrastructure utilities" claim, concrete examples:
- **uniq-tool-rust** — Rust reimplementation of the Unix `uniq` command (flags: `-c`, `-d`, `-u`, combinations, stdin piping).
- Redis in-memory store clone, L7 load balancer, TCP event loop, POSIX Unix shell, JSON parser, BPE tokenizer — referenced in your Technical Achievements section; keep a running list of repo links for these so you can back the claim in interviews.

### Open-source contributions
- **p5.js** — merged contribution(s) to the p5.js creative-coding library (large, well-known OSS project — strong signal, lead with this for any OSS-first company).
- **AsyncAPI** — merged PR(s).
- Full merged-PR log maintained at `github.com/NalinDalal/NalinDalal/blob/main/prs.md` — link this directly when a role cares about OSS track record.

### Learning/coursework repos (use sparingly — signals curiosity, not production experience)
- **ai** — self-study repo covering transformers, RNNs/LSTMs, scaling laws, MCP-agent wrapping. Includes a from-scratch RNN implementation.
- **Cohort-2** (100xDevs cohort notes) — systems-design notes (statelessness, sticky sessions, in-memory caching, pub/sub) — useful if a role probes system design fundamentals and you want to show you've studied it deliberately.
- **Data-Structures** — DSA practice repo with written explanations (linked lists, etc.) — evidence of teaching-style clarity, could support a trainer-role application.
- **dotfiles** — personal terminal/editor environment (Neovim, LazyGit, yazi) — minor, only include for "shows attention to tooling/DX" framing.
- **repl.it-clone, omegle-frontend** — earlier learning projects (frontend clones). Don't lead with these; fine as filler for entry-level/trainer applications showing breadth.

---

## Technical Achievements & Systems (as in current .tex)
- **Competitive Programming:** 550+ problems solved on LeetCode, 830+ on Codeforces — DS&A, graph theory.
- **Systems Engineering:** 30+ CLI/infra utilities from scratch in Rust, C++, TypeScript (Redis clone, L7 load balancer, TCP event loop, POSIX shell, JSON parser, BPE tokenizer).
- **Open Source:** Active contribution profile, merged PR log at the link above.

---

## Notes to self
- Rivet outreach angle: pinned GitHub repos currently read TS/Next.js-heavy — when applying there, lead with the Rust/Solana + systems-utilities section above, not the Next.js projects, and link `superdev-fellow-classes` + `uniq-tool-rust` explicitly.
- For ISRO/PSU-style or trainer applications: lean on Data-Structures repo (teaching angle) and Technical Achievements (CP numbers) — they tend to focus on fundamentals + resume walkthrough, not novel infra work.
- Keep the `prs.md` merged-PR log up to date — it's your single best proof point for "open-source contributor" claims across every variant above.
