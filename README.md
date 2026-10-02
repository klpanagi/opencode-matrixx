[![Matrixx](./.github/assets/orchestrator-architect.png?v=3)](https://github.com/klpanagi/opencode-matrixx)

<div align="center">

# Matrixx

[![npm](https://img.shields.io/npm/v/opencode-matrixx.svg)](https://www.npmjs.com/package/opencode-matrixx)
[![License: SUL-1.0](https://img.shields.io/badge/license-SUL--1.0-blue.svg)](https://github.com/klpanagi/opencode-matrixx/blob/master/LICENSE)
[![OpenCode](https://img.shields.io/badge/built_for-OpenCode-black.svg)](https://opencode.ai/docs)

**Multi-model agent orchestration for [OpenCode](https://github.com/sst/opencode).**<br/>
**14 specialized agents. 64 lifecycle hooks. 22 tools. 37 skills. One plugin.**

[Quick Start](#quick-start) · [Why Matrixx?](#why-matrixx) · [How It Works](#how-it-works) · [Features](#features) · [Comparison](#how-matrixx-compares) · [Docs](docs/README.md)

</div>

---

## Why Matrixx?

One model doing everything is a compromise. Planning, implementation, security review, and frontend polish require different strengths — different models, different prompts, different tools.

Matrixx turns OpenCode into a **team of specialists** coordinated by an orchestrator. The right model for the right job, in parallel, with persistent task state.

```
You: "Add OAuth2 with PKCE to the API"
     ↓
Morpheus                    → Plans the implementation
  ├─ Keymaker               → Builds auth middleware + routes
  ├─ Oracle                 → Reviews architecture in parallel
  └─ Sentinel               → Audits for security vulnerabilities
     ↓
     Done. Tested. Secure.
```

| Problem with single-agent coding | What Matrixx does |
|----------------------------------|-------------------|
| One model does everything averagely | **14 specialists** — orchestration, planning, implementation, security, frontend, DSL, research, search |
| Agent forgets what it was doing after `/clear` | **Persistent tasks** — file-backed `.matrixx/tasks`, survives compaction and restarts |
| Slow sequential tool calls | **Parallel background agents** — 5+ running simultaneously, optional tmux visibility |
| AI code looks like AI code | **Quality gates** — comment checking, TDD/BDD pipeline, 5-agent review |
| Context window fills up fast | **5-layer context stack** — native recovery + RTK + context-mode + DCP + Headroom |
| Fragile refactoring | **Deterministic tools** — LSP (goto-def, rename, diagnostics) + AST-Grep (structural search & replace) |
| Secrets leak into commits | **Security by default** — secret scanning + env-file guards + read-only auditor |

> Don't want to read docs? Just include `ultrawork` (or `ulw`) in your prompt. Parallel agents, deep exploration, relentless execution until completion.

---

## How It Works

Matrixx is a plugin for OpenCode. Install it, and OpenCode gains a 3-tier runtime:

1. **Orchestrator (Morpheus)** — sees your request, builds a task list, and delegates. Fires background agents in parallel instead of doing everything inline.
2. **Specialists** — plan (Oracle), implement (Keymaker/Mouse), audit (Sentinel), design UI (Sati), research docs and OSS (Operator), search code (Trinity), design languages (Cipher), validate plans (Smith, Seraph, Merovingian).
3. **Substrate** — file-backed tasks, lifecycle hooks, skills, and context compression keep work moving across sessions.

### Two ways to work

**Ultrawork — for speed.** Add `ultrawork` to any prompt:

```
ulw add authentication to my Next.js app
```

The agent explores your codebase, researches best practices, implements following your conventions, and verifies with diagnostics and tests. No planning ceremony.

**Oracle → Architect — for precision.** Press `Tab` for Oracle (planner), answer a short interview, get a work plan in `.matrixx/plans/*.md`, then run `/start-work`. The Architect executes phase by phase with independent verification. Best for multi-day work, production changes, and large refactors.

Full workflows: [Overview](docs/guide/overview.md) · [Orchestration](docs/orchestration.md) · [Task System](docs/task-system.md)

---

## Features

| Area | What you get | Details |
|------|--------------|---------|
| **Agent Orchestration** | 14 agents, category routing (`source`, `deep-jack`, …), session continuity, parallel background execution | [Agents](docs/agents.md) |
| **Developer Tools** | LSP, AST-Grep search & replace, tmux terminal, task tools, assembly (multi-model debate) | [Features](docs/features.md) |
| **Lifecycle Hooks (64)** | Context injection, think mode, task/todo continuation, error recovery, quality gates, session recovery | [Hooks](docs/hooks.md) |
| **Skills (37)** | DSL engineering (11), security (9), frontend (7), BDD (4 + pipeline), git, browser, TDD, research, AI-slop removal | [Skills](docs/category-skill-guide.md) |
| **Software Dev Pipeline** | 6-phase PLAN → BUILD → VERIFY → REVIEW → SECURE → SHIP with 5 team roles, adaptive to task size | [Quality](docs/quality.md) |
| **Context Management (L0–L4)** | Native recovery + RTK (60–90% bash savings) + context-mode sandbox + DCP pruning + Headroom proxy (60–95% JSON) | [Context](docs/context-management.md) |
| **Security** | Secret-leak guard (gitleaks), env-file write guard, read-only Sentinel auditor with CWE-rated findings | [Hooks](docs/hooks.md) · [Agents](docs/agents.md) |
| **Knowledge & Research** | Saturation `/research` swarms, Context7 docs, Exa web search, `github_search`, document reader, external knowledge hubs | [Features](docs/features.md) |
| **Configurability** | Every agent, model, temperature, and hook tunable via `matrixx.jsonc` with JSON schema + Config Studio UI | [Configuration](docs/configurations.md) |

> Counts verified against source (`BuiltinAgentNameSchema`, `BuiltinSkillNameSchema`, hook registry). The roster lives in docs — this page links, never duplicates.

---

## Quick Start

**Prerequisites:** Bun 1.4.0 · OpenCode ≥ 1.0.150

```bash
bunx opencode-matrixx install
bunx opencode-matrixx doctor   # no "fail" = good
opencode auth login             # connect at least one provider
```

Then open OpenCode and code. Matrixx activates automatically.

```jsonc
// matrixx.jsonc (project root) — minimal, everything else has sane defaults
{
  "$schema": "https://raw.githubusercontent.com/klpanagi/opencode-matrixx/refs/heads/dev/dist/matrixx.schema.json",
  "agents": {}
}
```

Full setup, CI mode, troubleshooting, and uninstall: [Installation guide](docs/guide/installation.md) · [CLI reference](docs/cli-guide.md)

---

## Honest Pros & Cons

**Where Matrixx shines**

- Right model for the right job — provider-resolved fallback chains work with free-tier OpenCode models out of the box, and mix freely with paid providers.
- True parallelism — background agents explore, review, and audit while implementation proceeds.
- Work survives interruptions — tasks persist across `/clear`, compaction, and restarts.
- Engineering-grade edits — LSP + AST-Grep instead of regex guesswork.
- Security and quality are built in, not bolted on — guards block secret leaks; Sentinel never writes code, only reports.
- Context economics — five complementary layers instead of one trick; retrieval-on-demand instead of re-reading history.
- Fully observable and tunable — every agent, model, and hook is config.

**Trade-offs to know**

- **OpenCode-only.** Matrixx is a plugin, not a standalone agent or IDE. You adopt OpenCode to use it.
- **Learning curve.** 14 agents, 8 categories, 37 skills, 24 commands — `ultrawork` hides this well, but mastery takes time.
- **Multiple providers help.** It runs on one provider, but the multi-model value shows with two or more connected (or the OpenCode free tier).
- **Orchestration overhead.** Delegation costs extra tokens on trivial one-line tasks — use direct mode for those.
- **Pinned toolchain.** Bun 1.4.0 and recent OpenCode are required; bleeding-edge OpenCode versions can break the plugin temporarily.
- **Fast-moving project.** Conventions and config keys evolve; pin versions in CI.

---

## How Matrixx Compares

| Tool | Approach | Where Matrixx differs |
|------|----------|-----------------------|
| **Vanilla OpenCode** | Single powerful agent + tools | Matrixx adds the team layer: specialists, persistent tasks, 64 hooks, skills, and context compression. Same base, orchestrated. |
| **Claude Code** | Polished single-vendor agent (Anthropic models) | Matrixx is provider-agnostic and multi-model by design — mix Claude, OpenAI, Gemini, local models per role instead of one vendor. More setup, more control. |
| **Cursor / Windsurf** | IDE-integrated agent with proprietary models | Matrixx lives in the terminal (OpenCode TUI), is fully open and configurable, and exposes its orchestration as code. No IDE lock-in, no black-box model routing. |
| **Cline / Roo Code** | IDE-based autonomous agents, mode switching | Similar autonomy ethos; Matrixx goes further on parallelism (background swarms), persistent cross-session tasks, and deterministic refactoring tools (LSP/AST-Grep). |
| **Aider / Continue** | Lightweight editor pair-programmers | Aider/Continue are fast and minimal for small edits. Matrixx targets larger multi-file work: planning, review, security audit, and BDD/TDD pipelines. |
| **Other OpenCode plugins** | Single-concern extensions | Matrixx is a full harness — agents + hooks + tools + skills + tasks + context — rather than one feature. Heavier, but replaces several plugins at once. |

**Rule of thumb:** for a quick single-file edit, any agent works — Matrixx adds little. For multi-file features, refactors, migrations, and production changes where planning, review, and security matter, orchestration pays off.

---

## Documentation

| Start with | Then read |
|------------|-----------|
| [Overview](docs/guide/overview.md) — what Matrixx does, two ways to work | [Installation](docs/guide/installation.md) — setup, auth, troubleshooting |
| [Features](docs/features.md) — capability index | [Agents](docs/agents.md) — full roster and when to use each |
| [Orchestration](docs/orchestration.md) — how work runs | [Configuration](docs/configurations.md) — every `matrixx.jsonc` option |
| [Context Management](docs/context-management.md) — 5-layer stack | [Quality](docs/quality.md) — BDD pipeline + TDD discipline |

Full index: [docs/README.md](docs/README.md)


## Acknowledgment

Matrixx is developed at and supported by the [Information Systems & Software Engineering Laboratory (ISSEL)](https://issel.ee.auth.gr/), Department of Electrical and Computer Engineering, Aristotle University of Thessaloniki.

Research, development, and infrastructure behind Matrixx are powered, and practically funded, by ISSEL. Thank you to the lab, its members, and its students for making this work possible.

---

If this saves you time, a ⭐ goes a long way.

<sub>Productivity might spike too hard. Don't let your coworker notice. Actually, let's see who wins.</sub>

---
