# FEATURES KNOWLEDGE BASE

## OVERVIEW

18 feature modules (background-agent, tmux-subagent, builtin-skills/commands, task-storage, bdd, assembly-state, evolution, handoff, context-injector, session-state...) — task-storage is now execution substrate (file-backed `.matrixx/tasks/`, replaces ephemeral todos).

## STRUCTURE
```
features/
├── background-agent/           # Task lifecycle, concurrency, restart reconciliation (33 files, ~5600 LOC)
│   ├── manager.ts              # Main task orchestration (2165 lines, grandfathered over the 200-LOC limit)
│   ├── concurrency.ts          # Parallel execution limits per provider/model
│   ├── reconcile.ts            # Restart reconciliation: classifies persisted in-flight handles
│   ├── admission.ts            # Nested-admission classifier (`classifyAdmission`)
│   ├── session-output.ts       # Shared output-validation helpers (assistant output, recorded errors)
│   ├── revive.ts               # Session revive: revivable-set classifier + handle rehydration
│   └── handle-index.ts         # File-backed handle index (`BgHandleSchema`, `.matrixx/bg-handles/`)
├── tmux-subagent/              # Tmux integration (25 files, ~3000 LOC)
│   └── manager.ts              # Pane management, grid planning (350 lines)
├── builtin-skills/             # Built-in skills (8 files, ~1700 LOC)
│   └── skills/                 # dev-browser, frontend-ui-ux, git-master (1111), matrixx-self-config, playwright
├── builtin-commands/           # 6 command templates (11 files, 1511 LOC)
│   └── templates/              # 22 templates: refactor, matrix-loop, init-deep, handoff, start-work, research, assembly, bdd-*, dcp-profile, evolution...
├── task-storage/               # Task system: schema + file-backed storage (project-scoped `getTaskDir()`, atomic `tmp+renameSync`, `addBlocks`/`addBlockedBy` Set) — 7 files, 1165 LOC + `task-toast-manager/`
├── context-injector/           # AGENTS.md, README.md, rules injection (6 files, 809 LOC)
├── handoff/                    # Multi-action handoff: create, read, list, archive
├── session-state/              # Subagent session state tracking (3 files)
├── hook-message-injector/      # System message injection (4 files)
├── task-toast-manager/         # Task progress notifications (4 files)
├── mission-state/              # Persistent state for multi-step ops (9 files)
└── tool-metadata-store/        # Tool execution metadata caching (3 files)```

## KEY PATTERNS

**Background Agent Lifecycle:**
Task creation → Queue → Admission check → Concurrency check → Execute → Monitor/Poll → Notification → Cleanup

**Terminal statuses** (`BackgroundTaskStatus`): `pending | running | completed | error | cancelled | interrupt | stopped | statusUncertain`. New Tier-1 additions:
- `stopped` — the session ended without terminal output (or admission was refused). Does NOT imply failure or success.
- `statusUncertain` — liveness could not be determined (e.g. host lookup failed after restart). Does NOT imply failure or completion.
- `interrupt` is retained for genuine mid-flight aborts (promptAsync rejection / abort).

**`BackgroundTerminalReason`** (optional, persisted on handle): `queue-saturated | no-output | uncertain | aborted | stale | nested-depth-exceeded`. Written to `BgHandleSchema.terminalReason` in `<project>/.matrixx/bg-handles/<taskId>.json`. Old handle files without these fields still load.

**Restart reconciliation** (`reconcile.ts`): On plugin start, `restoreHandles()` probes the live host for each persisted `running|pending` handle and classifies it as `completed | error | running | stopped | statusUncertain` instead of blindly flattening to `interrupt`. A still-running child is re-registered and polling restarts; concurrency is deliberately NOT re-acquired. Lookup failure degrades to `statusUncertain` (never assumes completion).

**Bounded admission** (`admissionTimeoutMs`): When a root task waits past the timeout on a saturated queue it becomes terminal `stopped` with `terminalReason: "queue-saturated"`. Value `0` = unbounded (default), otherwise minimum `60000` ms.

**Nested-admission exemption** (`nestedAdmission`): Prevents a managed background child that spawns its own background work from self-deadlocking the semaphore. `classifyAdmission` walks the child→parent session registry. Depth-cap overflow yields terminal `stopped` + `terminalReason: "nested-depth-exceeded"`. Config: `{ enabled: boolean (default true), mode: "bypass"|"reserve" (default "bypass"), maxDepth: 1..5 (default 2) }`.

**Session revive** (`revive.ts`, `background_revive` tool): A terminal task whose handle is still on disk can be resumed with a NEW instruction. Retention IS the existing handle files — there is no separate store — bounded by `TASK_TTL_MS` (30 min). Revivable: `cancelled | stopped | interrupt | error | completed` (each requires a `sessionID`); `statusUncertain` requires `force: true`; `pending | running` must use `background_output` instead; a handle that never produced a session (e.g. `queue-saturated`) is unrevivable. `manager.revive()` falls back to disk on an in-memory map miss, then re-admits through bounded/nested admission — and a nested revive bypasses the semaphore entirely so it can never await it unboundedly. `manager.resume()` remains the in-memory-only path.

**Skill Management:** All skills are loaded from `src/features/builtin-skills/` via `createBuiltinSkills()`. No external skill directory loading. Skills are configured via `disabled_skills` in `matrixx.jsonc`.

**SKILL.md Format:**
```yaml
---
name: my-skill
description: "..."
model: "claude-opus-4-6"    # optional
agent: "morpheus"           # optional
mcp:                        # optional embedded MCPs
  server-name:
    type: http
    url: https://...
---
# Skill instruction content
```

## HOW TO ADD

1. Create directory under `src/features/`
2. Add `index.ts`, `types.ts`, `constants.ts` as needed
3. Export from `index.ts` following barrel pattern
4. Register in main plugin if plugin-level feature

## CHILD DOCUMENTATION

- See `task-storage/AGENTS.md` for task schema and storage details
