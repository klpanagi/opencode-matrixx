>
> [![Matrixx](./.github/assets/orchestrator-architect.png?v=3)](https://github.com/klpanagi/matrixx)
>
> Matrixx is **highly inspired by** [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) — the project that pioneered the "oh-my-zsh for OpenCode" concept.
> Full credit to [code-yeongyu](https://github.com/code-yeongyu) for the original vision.
>

<div align="center">

<h1>Matrixx</h1>

[![npm](https://img.shields.io/npm/v/opencode-matrixx.svg)](https://www.npmjs.com/package/opencode-matrixx)
[![License: SUL-1.0](https://img.shields.io/badge/license-SUL--1.0-blue.svg)](https://github.com/klpanagi/matrixx/blob/master/LICENSE)

**Multi-model agent orchestration for [OpenCode](https://github.com/sst/opencode).**<br/>
**14 specialized agents. ~52 lifecycle hooks. 28 tools. One plugin.**

</div>

---

## What is Matrixx?

OpenCode is a powerful open-source AI coding agent. Matrixx makes it **smarter**.

Instead of one model doing everything, Matrixx coordinates a **team of specialists** — each model doing what it does best, in parallel, with full context awareness. The right model for the right job, automatically.

```
You: "Add OAuth2 with PKCE to the API"
     ↓
Morpheus (Claude Opus)     → Plans the implementation
  ├─ Keymaker (GPT 5.3)    → Builds auth middleware + routes
  ├─ Oracle (Claude Sonnet 4.6)  → Reviews architecture in parallel
  └─ Sentinel (Sonnet 4.6) → Audits for security vulnerabilities
     ↓
     Done. Tested. Secure.
```

---

## Why Matrixx?

| Problem | Matrixx Solution |
|---------|------------------|
| One model does everything poorly | **14 specialists** — right model for the right job |
| Agent forgets what it was doing | **Todo Continuation** — forces completion, no exceptions |
| Slow sequential tool calls | **Parallel background agents** — 5+ running simultaneously |
| AI-generated code looks like AI | **Comment Checker** — code indistinguishable from human-written |
| Context window fills up fast | **Aggressive delegation** — subagents carry the load |
| Fragile refactoring | **LSP + AST-Grep** — deterministic, safe, surgical |

---

## The Magic Word

**Don't want to read docs? Just type `ultrawork` (or `ulw`) in your prompt.**

That's it. Parallel agents, background tasks, deep exploration, relentless execution until completion. The agent figures out the rest.

---

## Quick Start

### Install

```bash
npm install -g opencode-matrixx
```

### Configure

Create `matrixx.jsonc` in your project root:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/klpanagi/matrixx/refs/heads/dev/dist/matrixx.schema.json",
  "profile": "balanced"
}
```

### Use

Open OpenCode and start coding. Matrixx activates automatically.

**For LLM agents** — paste this into Claude Code, AmpCode, Cursor, or any LLM agent:

```
Install and configure matrixx by following the instructions here:
https://raw.githubusercontent.com/klpanagi/matrixx/refs/heads/dev/docs/guide/installation.md
```

[Manual installation guide →](docs/guide/installation.md) · [Uninstall →](docs/guide/uninstallation.md)

---

## Profiles

Profiles assign models to every agent — one setting, full model lineup.

| Profile | Best For | Daily Cost |
|---------|----------|------------|
| **free** | Experimentation, prototyping | $0 |
| **budget** | Personal projects, light use | ~$1–3 |
| **economy** | Active development with cost control | ~$3–8 |
| **balanced** | Professional development | ~$8–20 |
| **performance** | Maximum capability | ~$20–50 |
| **go** | OpenCode Go subscription | Go quota |
| **go-duo** | Duo subscription, two users | Go Duo quota |
| **go-trio** | Trio subscription, three users | Go Trio quota |
| **go-ultimate** | Unlimited Go access | Go Ultimate quota |
| **xiaomi-ultimate** | Xiaomi-optimized ultimate | Xiaomi quota |

Profile defaults merge first; any `agents` or `categories` override takes precedence.

---

## The Agent Team

### 01. Morpheus — *The Orchestrator*

<img src=".github/assets/morpheus.png" width="200" align="right"/>

*The one who sees the code for what it truly is.*

**Role:** Master orchestrator and strategic coordinator

**Model:** Claude Opus 4.6 · `temperature: 0.1`

Plans, delegates, and executes. Fires background agents in parallel, leverages LSP and AST-Grep for surgical refactoring, and never stops until the TODO list is empty. Morpheus sees the code for what it truly is — and routes every task to the agent best suited for it.

---

### 02. Keymaker — *The Craftsman*

<img src=".github/assets/keymaker.png" width="200" align="right"/>

*Give him a goal, not a recipe.*

**Role:** Autonomous deep worker

**Model:** GPT 5.3 Codex · `temperature: 0.1`

Explores the codebase, matches your patterns, and delivers end-to-end. Keymaker doesn't need step-by-step instructions — give him a destination and he'll find the path, writing production-quality code along the way.

---

### 03. Cipher — *The Language Architect*

<img src=".github/assets/cipher.png" width="200" align="right"/>

*Grammars, parsers, and the art of formal languages.*

**Role:** DSL engineering specialist

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

Grammars, parsers, type systems, code generators, metamodels. 11 composable skills covering textX, ANTLR4, tree-sitter, PyEcore, and more. If it involves defining a language or transforming code, Cipher is your specialist.

---

### 04. Sentinel — *The Security Auditor*

<img src=".github/assets/sentinel.png" width="200" align="right"/>

*Reads every line. Changes nothing. Reports everything.*

**Role:** Read-only security specialist

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

Scans for vulnerabilities but never touches code. OWASP Top 10, SAST, DAST, dependency CVEs, secret detection, crypto audit, infrastructure hardening. 9 composable security skills. Sentinel reports findings with CWE IDs, exact locations, and actionable remediation.

---

### 05. Sati — *The Frontend Specialist*

<img src=".github/assets/sati.png" width="200" align="right"/>

*Crafts stunning UI/UX, even without design mockups.*

**Role:** Frontend specialist

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

React/Next.js, Svelte/SvelteKit, accessibility, performance, design tokens, component architecture, build tooling. Sati ships production-grade UI work with browser verification via Playwright. Invoke directly with `@sati/` or `task(subagent_type="sati")` for any non-trivial frontend task.

---

### 06. Oracle — *The Plan Builder*

<img src=".github/assets/oracle.png" width="200" align="right"/>

*Architecture demands precision. Oracle delivers it.*

**Role:** Strategic planning, architecture decisions, work plan generation

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

Creates detailed, structured work plans from complex requests. Decomposes ambiguous requirements into atomic, verifiable steps with clear success criteria. Oracle builds the plan — Morpheus executes it.

---

### 07. Merovingian — *The Consultant*

<img src=".github/assets/merovingian.png" width="200" align="right"/>

*High-IQ reasoning for problems that refuse to yield.*

**Role:** High-IQ consultation, hard debugging, architecture design

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

Read-only consultation for hard debugging (after 2+ failed attempts), multi-system tradeoffs, and architecture decisions requiring deep reasoning. Merovingian analyzes — never implements.

---

### 08. Architect — *The Master Orchestrator*

<img src=".github/assets/orchestrator-architect.png" width="200" align="right"/>

*Where plans become reality.*

**Role:** Plan execution orchestrator, session coordination

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

Executes Oracle's work plans, coordinates session state, manages task dependencies, and ensures every phase completes before moving to the next. The Architect is the bridge between planning and shipping.

---

### 09. Seraph — *The Pre-Planner*

<img src=".github/assets/seraph.png" width="200" align="right"/>

*Sees what others miss before work begins.*

**Role:** Pre-planning analysis, ambiguity detection, AI failure prevention

**Model:** Claude Opus 4.6 · `temperature: 0.3`

Analyzes requests to identify hidden intentions, ambiguities, scope creep, and AI failure points. Seraph intervenes before planning starts — preventing costly mistakes downstream.

---

### 10. Smith — *The Validator*

<img src=".github/assets/smith.png" width="200" align="right"/>

*Every plan meets Smith's standards — or gets rewritten.*

**Role:** Plan validation, completeness review, gap detection

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

Evaluates work plans against rigorous clarity, verifiability, and completeness standards. Catches gaps, ambiguities, and missing context before implementation begins. Smith is the last line of defense.

---

### 11. Operator — *The Researcher*

<img src=".github/assets/operator.png" width="200" align="right"/>

*Finds what you need, where it lives.*

**Role:** External documentation, OSS search, library research

**Model:** Claude Haiku 4.5 · `temperature: 0.1`

Specialized codebase understanding agent for multi-repository analysis, searching remote codebases, retrieving official documentation, and finding implementation examples using GitHub CLI, Context7, and Web Search.

---

### 12. Trinity — *The Search Engine*

<img src=".github/assets/trinity.png" width="200" align="right"/>

*Finds anything, anywhere, instantly.*

**Role:** Blazing fast codebase grep, pattern discovery

**Model:** Claude Haiku 4.5 · `temperature: 0.1`

Contextual grep for codebases. Answers "Where is X?", "Which file has Y?", "Find the code that does Z". Fires multiple in parallel for broad searches. Quick, medium, or very thorough — you choose.

---

### 13. Construct — *The Media Analyst*

<img src=".github/assets/construct.png" width="200" align="right"/>

*Sees what's inside — images, PDFs, diagrams.*

**Role:** PDF, image & diagram analysis

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

Analyzes media files that require interpretation beyond raw text. Extracts specific information or summaries from documents, describes visual content. Use when you need analyzed/extracted data rather than literal file contents.

---

Every agent, model, temperature, and permission is fully customizable. [**Meet the full team →**](docs/agents.md)

---

## Features

| | |
|---|---|
| **Agent Orchestration** | 14 agents (incl. **Sati** frontend specialist, **Sentinel** security auditor, **Cipher** DSL expert), parallel background execution, category-based routing, session continuity |
| **Developer Tools** | LSP (goto def, rename, diagnostics), AST-Grep (search & replace), Tmux terminal |
| **~52 Lifecycle Hooks** | Context injection, think mode, comment checking, todo enforcement, error recovery, quality gate |
|| **33 Built-in Skills** | DSL engineering (11), security (9), browser, git, frontend (7 via **Sati**), saturation research, AI slop detection, software dev pipeline |
| **Curated MCPs** | Exa (web search), Context7 (official docs), Grep.app (GitHub code search), Document Reader |
| **Claude Code Compat** | Full compatibility — commands, agents, skills, MCPs, hooks from `settings.json` |
| **Software Dev Pipeline** | 6-phase TDD workflow (PLAN→BUILD→VERIFY→REVIEW→SECURE→SHIP), 5 team roles, adaptive phases |
||| **Assembly Tool** | Multi-model debate that spawns 3-5 parallel voters from different providers, collects independent reasoning, and synthesizes unified decisions with confidence scoring |
|| **Saturation Research** | Multi-round (/research) spawning parallel explore/librarian swarms across code, docs, web, and OSS with adaptive novelty-based convergence (max 5 rounds) |
|| **AI Slop Detection** | remove-ai-slops skill detects and removes 7 categories of AI-generated code smells — verbose comments, redundant error handling, over-engineered patterns, generic AI phrasing, cargo-cult boilerplate |

[**Full feature list →**](docs/features.md) · [**Configuration guide →**](docs/configurations.md) · [**Architecture diagram →**](docs/agent-architecture.md)

---

## Software Development Pipeline

Matrixx includes a structured **6-phase development pipeline** that coordinates specialized roles through PLAN → BUILD → VERIFY → REVIEW → SECURE → SHIP. Each phase has clear entry/exit criteria and is enforced by dedicated agents.

### Team Roles

| Role | Agent | Skills | Purpose |
|------|-------|--------|---------|
| **Architect** | Oracle (Claude Opus) | — | System design, architecture decisions, task breakdown |
| **Developer** | Source category | `git-master`, `tdd-enforcer` | Implementation code with TDD |
| **Tester** | Source category | `tdd-enforcer`, `quality-gate` | Test authoring, coverage, verification |
| **Quality Evaluator** | Red-pill category | `quality-gate`, `review-work` | Lint, typecheck, 5-agent code review |
| **Security Expert** | Sentinel (Claude Opus) | `security-core`, `security-sast`, `security-api`, `security-dependencies` | Vulnerability scanning, CVE checks |

### Pipeline Phases

| Phase | Skip? | Role | Exit Criteria |
|-------|-------|------|---------------|
| **PLAN** | Small tasks | Architect | Approach defined, files listed, edge cases documented |
| **BUILD** | Never | Developer | TDD (RED→GREEN→REFACTOR), `bun test` passes |
| **VERIFY** | Never | Quality | `lint` + `typecheck` + `test` + `build` — all pass |
| **REVIEW** | Small tasks | Quality (5-agent) | All reviewers PASS, no CRITICAL/MAJOR issues |
| **SECURE** | Small + non-security | Security | No CRITICAL/HIGH findings, dependencies checked |
| **SHIP** | Never | Developer | Atomic commits, PR to dev, CI passes |

### Task Size Adaptivity

| Size | Files | Phases Used |
|------|-------|-------------|
| **Small** | 1-2 | BUILD → VERIFY → SHIP |
| **Medium** | 3-10 | PLAN → BUILD → VERIFY → REVIEW → SHIP |
| **Large** | 10+ | ALL 6 PHASES |
| **Security-related** | Any | Always includes SECURE |

Load the `software-dev` skill to activate the pipeline. The orchestrator automatically selects the right roles and phases based on task scope.

---

## Security

Matrixx includes a three-tier security layer: reactive hooks, configurable policies, and a dedicated security auditing agent.

### Enforcement Hooks

Built-in hooks protect against accidental secret exposure — no setup required.

| Hook | What it does |
|------|-------------|
| **Secret Leak Guard** | Intercepts `git commit` and `git push`, runs [gitleaks](https://github.com/gitleaks/gitleaks) on staged changes, and **blocks the operation** if secrets are detected. |
| **Env File Write Guard** | Blocks agents from writing to sensitive files (`.env`, `*.pem`, `*.key`, `credentials.json`, `id_rsa`, and 16 other patterns). |

Both hooks are **enabled by default** and run before all other hooks in the execution pipeline. Configure via `matrixx.jsonc`:

```jsonc
{
  "security": {
    "secret_scanning": { "enabled": true, "block_on_detection": true },
    "env_file_guard": { "enabled": true, "allowed_paths": [".env.example"] }
  }
}
```

> **Note:** Secret scanning requires [gitleaks](https://github.com/gitleaks/gitleaks) installed in your PATH. Without it, the hook silently degrades.

### Sentinel — Security Auditing Agent

**Sentinel** is a read-only security specialist with 9 composable skills covering the full application security stack:

| Skill | Domain |
|-------|--------|
| `security-core` | OWASP Top 10, CWE classification, threat modeling (STRIDE) |
| `security-secrets` | Secret detection, credential scanning, pre-commit hooks |
| `security-sast` | Static analysis, code vulnerability patterns, taint tracking |
| `security-dast` | Dynamic analysis, runtime testing, fuzzing, penetration testing |
| `security-dependencies` | CVE scanning, SBOM generation, supply chain security |
| `security-api` | Authentication, authorization, CORS/CSRF, input validation |
| `security-crypto` | Encryption audit, key management, TLS, password hashing |
| `security-infra` | Container scanning, Dockerfile hardening, IaC audit, K8s security |
| `security-review` | Structured audit reports, severity classification, remediation guidance |

Sentinel never modifies code — it reports findings with CWE IDs, exact locations, and actionable remediation. Any agent can load individual security skills via `load_skills`.

---

## Documentation

| | |
|---|---|
| [Overview](docs/guide/overview.md) | What Matrixx does, workflows, getting started |
| [Agents Deep Dive](docs/agents.md) | Full agent descriptions, skills, workflows, example prompts |
| [Architecture](docs/agent-architecture.md) | System diagrams, delegation flows, model routing |
| [Features](docs/features.md) | Complete feature reference |
| [Configuration](docs/configurations.md) | All config options, agent overrides, hooks, categories |
| [Orchestration](docs/orchestration-guide.md) | How agents coordinate, delegate, and recover |
| [Categories & Skills](docs/category-skill-guide.md) | Task categories, skill injection, delegation patterns |

---

If this saves you time, a ⭐ goes a long way.

**Curious about the philosophy?** Read the [Ultrawork Manifesto](docs/ultrawork-manifesto.md) — originally authored by [code-yeongyu](https://github.com/code-yeongyu), the creator of oh-my-opencode.

<sub>Productivity might spike too hard. Don't let your coworker notice. Actually — let's see who wins.</sub>
