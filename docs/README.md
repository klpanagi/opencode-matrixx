# Matrixx Documentation

> Version 2.6.10. All pages are English-only. Start with the row that matches
> your goal; each page declares its audience in its header.

## Start here

| Page | Audience | What you get |
|---|---|---|
| `guide/overview.md` | New users | Two ways to work (ultrawork vs. `/start-work`), what Matrixx adds to OpenCode |
| `guide/installation.md` | New users (humans + LLM agents) | Prerequisites, install, auth, troubleshooting, uninstalling |
| `features.md` | Evaluators | Capability index with links — one line per feature, details elsewhere |

## Use Matrixx

| Page | Audience | What you get |
|---|---|---|
| `orchestration.md` | Users running multi-step work | The delegation workflow: planner → plan → mission → workers |
| `agents.md` | Users choosing agents | The 14 agents: what each does and when to use it |
| `category-skill-guide.md` | Users composing work | The 8 task categories × 37 skills, and how they combine |
| `command-reference.md` | Users | All 24 slash commands: usage, options, examples |
| `quality.md` | Users implementing features or enforcing tests | BDD pipeline (Part A) + TDD discipline (Part B): when to use which |
| `evolution.md` | Users opting into learning | What self-evolution records, approves, and compresses (default off) |
| `knowledge-hub.md` | Users with an external corpus | Hub declaration, router-only discipline, read-only guard + confirm flow |

## Configure & operate

| Page | Audience | What you get |
|---|---|---|
| `configurations.md` | Operators | Full `matrixx.jsonc` reference (generated from `src/config/schema/`) |
| `hooks.md` | Users + engineers | Every hook: what it does, why it exists, when it fires, how to disable it |
| `task-system.md` | Users (Part A) + engineers (Part B) | Using tasks; the file-backed `.matrixx/tasks/` substrate spec |
| `context-management.md` | Operators + engineers | The 5 context layers (RTK, context-mode, DCP, headroom, hooks); install/verify/config |
| `cli-guide.md` | Operators | The `opencode-matrixx` binary: install, doctor, setup, version |
| `config-studio.md` | Operators | Pointer to the Config Studio app docs (`apps/matrixx-config/README.md`) |

## Research

| Page | Audience | What you get |
|---|---|---|
| `research/cost-performance.md` | Researchers | Point-in-time cost/performance proposals (not a usage reference) |

## Engineering

| Page | Audience | What you get |
|---|---|---|
| `v2-migration.md` | Engineers continuing the migration | OpenCode V1→V2 status, verified V2 capability matrix, upstream V1-deprecation assessment, dependency-ordered V1 removal plan |
| `v2-smoke.md` | Engineers | The Docker harness that proves V2 against a real OpenCode V2 host |

## Suggested paths

- **First install:** `guide/overview.md` → `guide/installation.md` → `features.md`.
- **First multi-agent task:** `orchestration.md` → `command-reference.md` (`/start-work`).
- **Slow or surprising behavior:** `hooks.md` §3–§4 → `context-management.md` → `cli-guide.md` (`doctor`).
- **Contributing a hook/skill/agent:** `hooks.md` §6 → `task-system.md` Part B → `configurations.md`.
