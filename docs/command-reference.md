# Command Reference

> Version 2.6.10. All 24 commands below are registered in `src/features/builtin-commands/commands.ts` (`BUILTIN_COMMAND_DEFINITIONS`) with names validated by `BuiltinCommandName` in `src/features/builtin-commands/types.ts`.

Matrixx provides 24 built-in slash commands covering orchestration, research, refactoring, handoffs, task management, BDD, and tool toggles.

> **Count reconciliation (honest):** the Zod `BuiltinCommandNameSchema` in `src/config/schema/commands.ts` lists 19 names (used for `disabled_commands` validation). `BUILTIN_COMMAND_DEFINITIONS` in `src/features/builtin-commands/commands.ts` (and the local `BuiltinCommandName` union in `src/features/builtin-commands/types.ts`) registers 24 — the extra 5 are `pickup`, `remove-deadcode`, `evolution`, `cleanup-tasks`, and `task-list`. Templates live in `src/features/builtin-commands/templates/` (22 files; `matrix-loop`/`ulw-loop` share one template).

---

## Quick Reference

| Command | Purpose | Has Intercept | Agent |
|---------|---------|:---:|:---:|
| `/init-deep` | Generate AGENTS.md knowledge base | — | — |
| `/matrix-loop` | Start self-referential dev loop | ✅ | — |
| `/ulw-loop` | Start dev loop with ultrawork mode | ✅ | — |
| `/cancel-loop` | Cancel active dev loop | ✅ | — |
| `/refactor` | Guided refactoring (LSP + AST-grep + TDD) | — | — |
| `/start-work` | Execute Oracle work plan | — | architect |
| `/stop-continuation` | Pause automated continuation | ✅ | — |
| `/handoff` | Create session handoff | — | — |
| `/pickup` | Resume from handoff | — | — |
| `/remove-deadcode` | Delete unused code (LSP-verified) | — | — |
| `/preset` | List/show/set model presets (live switch; `--save` persists) | — | — |
| `/end-ultrawork` | Deactivate ultrawork mode | ✅ | — |
| `/research` | Saturation research (multi-round) | — | — |
| `/assembly` | Toggle assembly tool at runtime | ✅ | — |
| `/ultrawork` | Toggle ultrawork mode at runtime | ✅ | — |
| `/task-list` | List active tasks (`task_list`) | — | — |
| `/cleanup-tasks` | Clean completed tasks (`task_cleanup`) | — | — |
| `/dcp-profile` | Switch DCP pruning tier | ✅ | — |
| `/evolution` | Self-evolution proposals (approve/reject/list) | — | — |
| `/bdd-contract` | BDD contract from Gherkin | — | bdd-contract |
| `/bdd-frontend` | BDD React components | — | — |
| `/bdd-backend` | BDD typed API service | — | — |
| `/bdd-pipeline` | Full BDD pipeline (contract→tests→frontend→backend) | — | — |
| `/bdd-tests` | BDD Cucumber steps + page objects | — | — |

### Legend

- **Has Intercept** — the command performs imperative side effects (state mutation, background task cancellation) in `tool-execute-before.ts` in addition to its template.
- **Agent** — commands that route to a specific agent instead of the default.

---

## 1. `/init-deep`

Generate or refresh a hierarchical AGENTS.md knowledge base for the project.

```
/init-deep
/init-deep --create-new
/init-deep --max-depth=5
```

| Argument | Default | Description |
|----------|---------|-------------|
| `--create-new` | `false` | Create fresh AGENTS.md files even if they exist |
| `--max-depth=N` | `3` | Maximum directory recursion depth |

**Phases:** Discovery (parallel explore agents) → Scoring (relevance/cohesion) → Generate → Review

---

## 2. `/matrix-loop`

Start a self-referential development loop. The agent continuously works on a task, checking completion after each cycle, until done or interrupted.

```
/matrix-loop Implement the user auth module
/matrix-loop Fix database migrations --max-iterations=10
/matrix-loop "Refactor API routes" --completion-promise="All routes use v2 schema"
```

| Argument | Description |
|----------|-------------|
| `task` (positional) | The task description to work on continuously |
| `--max-iterations=N` | Maximum loop iterations (default: varies) |
| `--completion-promise=TEXT` | Condition that signals loop completion |

This command has an **imperative intercept** — it calls the matrix-loop manager to start tracking the loop via `hooks.matrixLoop?.startControllerSession()`.

**Related:** `/cancel-loop` to stop, `/ulw-loop` for ultrawork variant.

---

## 3. `/ulw-loop`

Identical to `/matrix-loop` but activates ultrawork mode for the duration of the loop. Same arguments:

```
/ulw-loop Implement critical auth flow --max-iterations=15
```

This command has an **imperative intercept** — same as matrix-loop but activates ultrawork state.

---

## 4. `/cancel-loop`

Cancel an active Matrix Loop or ULW Loop.

```
/cancel-loop
```

No arguments. Calls `hooks.matrixLoop?.cancelAll()` to stop all running loops.

This command has an **imperative intercept**.

---

## 5. `/refactor`

Intelligent refactoring with 6 phases: architecture analysis, codemap, TDD, implementation, verification.

```
/refactor src/api/routes/auth.ts
/refactor src/utils/ --scope=module
/refactor src/index.ts --strategy=safe
```

| Argument | Default | Description |
|----------|---------|-------------|
| `target` (positional) | — | File or directory to refactor |
| `--scope` | `file` | `file`, `module`, or `project` |
| `--strategy` | `safe` | `safe` (preserve behavior) or `aggressive` (improve design) |

**Phases:**
1. Architecture analysis (LSP + AST-grep)
2. Codemap generation (dependency graph)
3. TDD setup (write tests first)
4. Implementation
5. Verification (tests + typecheck + lint)
6. Cleanup (remove dead code)

---

## 6. `/start-work`

Execute a work plan generated by the Oracle agent. Routes to the `architect` agent for plan execution. See [Orchestration](orchestration.md) for the plan-then-execute model.

```
/start-work
/start-work my-plan-name
```

| Argument | Description |
|----------|-------------|
| `plan-name` (optional) | Specific plan to execute |

The agent loads the plan and works through it systematically, marking items as it completes them.

---

## 7. `/stop-continuation`

Stop all automated continuation mechanisms for the current session.

```
/stop-continuation
```

No arguments. This command:

1. Stops the todo-continuation-enforcer from auto-continuing incomplete tasks
2. Cancels any active Matrix Loop
3. Clears the mission state

This command has an **imperative intercept** — it calls `hooks.stopContinuationGuard?.stop(sessionID)` which also cancels all background tasks for the session via `cancellAllForSession()`.

The stop state is per-session and automatically clears when a new user message arrives or the session ends.

---

## 8. `/handoff`

Create a structured handoff for continuing work in a new session. Uses the `handoff` tool.

```
/handoff
/handoff Finish the Stripe integration
```

| Argument | Description |
|----------|-------------|
| `goal` (optional) | One-sentence description of what should be done next |

**Phases:**
1. Gather — collect current state, todos, key files, decisions
2. Tool call — write structured handoff to `.matrixx/handoff.md`
3. Inform — confirm the handoff was created

The handoff includes: topics, user requests, work completed, pending tasks, key files, important decisions, and explicit constraints.

**Related:** `/pickup` to resume from a handoff.

---

## 9. `/pickup`

Load and resume work from a prior handoff. Uses the `handoff` tool.

```
/pickup
/pickup Refactor database layer
```

| Argument | Description |
|----------|-------------|
| `task` (optional) | Specific task to resume |

**Phases:**
1. Read — load `.matrixx/handoff.md`
2. Acknowledge — confirm the handoff content
3. Archive — rename handoff to `.matrixx/handoff.consumed.md`

---

## 10. `/remove-deadcode`

Find and remove unused code using LSP reference analysis. 5-phase workflow with dry-run support.

```
/remove-deadcode
/remove-deadcode src/utils/old-helpers.ts
/remove-deadcode src/legacy/ --scope=module --dry-run
```

| Argument | Default | Description |
|----------|---------|-------------|
| `target` (positional) | entire project | File or directory to analyze |
| `--scope` | `project` | `file`, `module`, or `project` |
| `--dry-run` | `false` | Preview removals without deleting |

**Phases:**
1. Discovery — find zero-reference symbols via LSP
2. Analysis — verify removals are safe (no re-exports, no dynamic access)
3. Confirmation — show what will be removed (respects dry-run)
4. Removal — delete declarations and update imports
5. Verification — typecheck + test to confirm nothing broke

---

## 11. `/end-ultrawork`

Deactivate ultrawork mode and return to default behavior.

```
/end-ultrawork
/end-ultrawork Continue with the auth implementation
```

| Argument | Description |
|----------|-------------|
| `follow-up task` (optional) | Task to continue with after deactivating ultrawork |

This command has an **imperative intercept** — it calls `ultraworkState.disable(sessionID)` to persist the disabled state, so subsequent messages won't trigger ultrawork even if they contain the keyword.

---

## 12. `/research`

Execute a systematic multi-round research process. Spawns parallel swarms of explore + operator agents, then recursively follows leads until convergence.

```
/research how does context window management work in this codebase
/research React 19 server component patterns --scope=web --max-rounds=3
/research authentication middleware best practices
```

| Argument | Default | Description |
|----------|---------|-------------|
| `topic` (positional) | — | The research question or topic |
| `--scope` | `all` | `code`, `docs`, `web`, `oss`, or `all` |
| `--max-rounds=N` | `5` | Maximum recursive depth (1-5) |

**Process:**
1. Creates artifact directory: `.matrixx/research-<topic>-<timestamp>/`
2. Spawns 4 parallel research agents (explore + operator swarms)
3. Collects findings, identifies new leads
4. Recursively follows leads until novelty convergence
5. Verifies contested claims by running code
6. Produces cited synthesis in `final-synthesis.md`

**Output files:**
| File | Description |
|------|-------------|
| `round-N-findings.md` | Per-round findings |
| `leads.md` | Tracked leads |
| `contested-claims.md` | Claims needing verification |
| `final-synthesis.md` | Final cited synthesis |

---

## 13. `/assembly`

Enable or disable the multi-model assembly tool for the current session.

```
/assembly
/assembly enable
/assembly disable
/assembly status
```

| Argument | Description |
|----------|-------------|
| `enable` | Make the assembly tool available to the LLM |
| `disable` | Hide the assembly tool (LLM won't see or use it) |
| `status` | Show current enable/disable state |

This command has an **imperative intercept** — it calls `assemblyState.disable(sessionID)` or `assemblyState.enable(sessionID)` to persist the state change.

**Note:** The assembly tool also has a config-level toggle via `assembly.enabled` in `matrixx.jsonc` (default: `true`). The runtime toggle applies only to the current session and resets when the session ends.

---

## 14. `/ultrawork`

Control ultrawork mode at runtime with three states: force-on, force-off, or default (keyword-triggered).

```
/ultrawork
/ultrawork enable
/ultrawork disable
/ultrawork status
```

| Argument | Description |
|----------|-------------|
| `enable` | Force ultrawork ON for all messages (even without keyword) |
| `disable` | Block ultrawork entirely (keyword won't activate) |
| `status` | Show current ultrawork state |

| State | Behavior |
|-------|----------|
| `undefined` (default) | Ultrawork activates when message contains "ultrawork" or "ulw" keyword |
| `enabled` | Every message gets ultrawork injection regardless of content |
| `disabled` | Ultrawork never activates, even with keyword |

This command has an **imperative intercept** — it calls `ultraworkState.enable(sessionID)` or `ultraworkState.disable(sessionID)`.

**Related:** `/end-ultrawork` is equivalent to `/ultrawork disable` but additionally injects a follow-up task template.

---

## 15. `/preset`

List, inspect, or switch model presets at runtime. Backed by the `preset` tool (`src/tools/preset/tools.ts`).

```
/preset
/preset show flagship
/preset set flagship
/preset set flagship --save --project
```

| Argument | Description |
|----------|-------------|
| `list` (default) | List available presets, marking the active one |
| `show [<name>]` | Show a preset's agent/category model assignments |
| `set <name>` | Switch the active preset for the current session (delegate-task categories switch immediately; builtin agents apply on the next session) |
| `--save [--global\|--project]` | Also persist `active_preset` to config (project `.opencode/matrixx.jsonc` by default) |

**Related:** [Model Presets](configurations.md#model-presets).

---

## 16. `/task-list`

Show the current state of all tasks. Thin wrapper over the `task_list` tool.

```
/task-list
/task-list --status in_progress
/task-list --all
```

| Argument | Default | Description |
|----------|---------|-------------|
| `--all` | `false` | Include completed and deleted tasks |
| `--status <pending\|in_progress\|completed\|deleted>` | — | Filter by status |

**Related:** [Task System](task-system.md), `/cleanup-tasks` to remove finished work.

---

## 17. `/cleanup-tasks`

Delete completed tasks. Thin wrapper over the `task_cleanup` tool. Never deletes `pending` or `in_progress` tasks.

```
/cleanup-tasks
/cleanup-tasks --olderThan 7d
/cleanup-tasks --all
```

| Argument | Default | Description |
|----------|---------|-------------|
| `--olderThan <duration>` | — | Only delete completed tasks older than `"7d"`, `"24h"`, or `"30m"` |
| `--all` | `false` | Delete all completed tasks regardless of age |

---

## 18. `/dcp-profile`

Switch the DCP (Dynamic Context Pruning) tier at runtime: `economy`, `balanced`, `performance`, or `ultimate`.

```
/dcp-profile balanced
/dcp-profile ultimate
```

| Argument | Description |
|----------|-------------|
| `<profile-name>` | DCP tier to activate for the current session |

This command has an **imperative intercept** — it switches the active DCP profile via the dcp-switch-profile tool (`src/tools/dcp-switch-profile/`).

**Related:** [Context Management](context-management.md), `dcp` key in [Configuration](configurations.md#dcp).

---

## 19. `/evolution`

Manage self-evolution proposals: list pending skill proposals, approve or reject them, audit the queue.

```
/evolution
/evolution list
/evolution approve my-proposal
/evolution reject my-proposal
/evolution audit
```

| Argument | Description |
|----------|-------------|
| `list` (default) | Show pending proposals |
| `approve <slug>` | Approve and promote a proposal |
| `reject <slug>` | Reject a proposal |
| `audit` | Audit the proposal queue |

Evolution hooks only run when `evolution.enabled: true` in config. See [Evolution](evolution.md) and [Configuration](configurations.md#evolution-self-evolution).

---

## 20. `/bdd-contract`

Generate a BDD Contract JSON from a Gherkin `.feature` file, with semantic enrichment.

```
/bdd-contract features/login.feature
/bdd-contract features/login.feature --force
```

| Argument | Description |
|----------|-------------|
| `<feature-path>` | Path to the `.feature` file |
| `--force` | Overwrite existing contract output |

Routes to the `bdd-contract` agent. **Related:** `/bdd-pipeline`, [Quality, Part A](./quality.md).

---

## 21. `/bdd-frontend`

Generate React components from a BDD Contract JSON file, using `@ui:*` annotations.

```
/bdd-frontend contracts/login.contract.json
```

| Argument | Description |
|----------|-------------|
| `<contract.json>` | Path to the contract file produced by `/bdd-contract` |

---

## 22. `/bdd-backend`

Generate a typed API service from a BDD Contract JSON file.

```
/bdd-backend contracts/login.contract.json
```

| Argument | Description |
|----------|-------------|
| `<contract.json>` | Path to the contract file produced by `/bdd-contract` |

---

## 23. `/bdd-pipeline`

Run the full BDD pipeline from a single `.feature` file: contract, tests, frontend, and backend.

```
/bdd-pipeline features/login.feature
/bdd-pipeline features/login.feature --force
```

| Argument | Description |
|----------|-------------|
| `<feature-path>` | Path to the `.feature` file |
| `--force` | Overwrite existing outputs |

Runs the contract, tests, frontend, and backend stages in order. **Related:** [Quality, Part A](./quality.md).

---

## 24. `/bdd-tests`

Generate Cucumber step definitions and page objects from a BDD Contract JSON file.

```
/bdd-tests contracts/login.contract.json
```

| Argument | Description |
|----------|-------------|
| `<contract.json>` | Path to the contract file produced by `/bdd-contract` |

---

In addition to the 24 built-in commands above, Matrixx loads custom commands from these locations (in priority order):

| Priority | Location |
|:---:|----------|
| 1 | `.opencode/commands/` (project) |
| 2 | `.config/opencode/commands/` (user global) |
| 3 | `commands` entries in `.mcp.json` |

Custom commands can define a `name`, `description`, `template`, optional `agent` override, and `argumentHint`. They are loaded by the Claude Code command loader and merged into Matrixx's command list.

---

## Architecture Notes

### Templates

All built-in command templates are stored in `src/features/builtin-commands/templates/` as exported string constants. Each template is a markdown-formatted string that gets injected as a system message when the command is invoked.

### Registration

Commands are registered in `src/features/builtin-commands/commands.ts` via the `BUILTIN_COMMAND_DEFINITIONS` record, keyed by command name. The schema is validated at plugin startup.

### Intercept Pattern

Commands with imperative behavior (state mutation, background task cancellation) have intercepts in `src/plugin/tool-execute-before.ts`. When the LLM calls `slashcommand`, the intercept parses the command name and subcommand, then performs the side effect before the template is injected.

Commands with intercepts:
- `/matrix-loop` — starts matrix loop tracking
- `/ulw-loop` — starts matrix loop + ultrawork
- `/cancel-loop` — cancels all loops
- `/stop-continuation` — sets stop state + cancels background tasks
- `/assembly` — toggles assembly state
- `/ultrawork` — toggles ultrawork state
- `/end-ultrawork` — disables ultrawork state
- `/dcp-profile` — switches the active DCP tier

### State Lifecycle

Per-session state (stop-continuation, assembly, ultrawork) is stored in-memory `Set` or `Map` structures. State is automatically cleaned up on `session.deleted` events. State does not persist across OpenCode restarts.
