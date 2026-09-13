# Subagent task orphans caused false continuation directive (2026-09-13)

> Status: INVESTIGATED — directive was a FALSE ALARM (all 17 "remaining" tasks were already complete; CI 7/7 green). Root cause: task files auto-created by subagent sessions were orphaned when those sessions died to a provider outage. Fix pointers documented for a future session.

## TL;DR

During the tiers→model-presets refactor, a `[SYSTEM DIRECTIVE: MATRIXX - TASK CONTINUATION]` fired with `[Status: 18/35 completed, 17 remaining]` — listing 17 tasks as `in_progress`/`pending`. **Every one of them was actually complete.** Full CI (`bash script/run-ci.sh`) was 7/7 green, and the two test files that had been failing were passing (137 pass, 0 fail).

The directive was a **false alarm caused by orphaned subagent task files**:

1. Subagent sessions (Mouse, spawned via `task()`) create their own task breakdowns with `task_create`.
2. The task store is **project-scoped** (`.matrixx/tasks/`, via `getTaskDir()`), so subagent tasks land in the same shared store the orchestrator and the continuation enforcer read.
3. During the provider outage, several subagent sessions died (poll timeouts, vanishing sessions) **before marking their tasks completed**. Their task files persisted in `in_progress`/`pending`.
4. The continuation enforcer counts **all** incomplete tasks in the shared store on `session.idle` — it has no notion of "the session that created this task is dead", so the orphans triggered the directive.

## Evidence

### Task file states (`.matrixx/tasks/`, project-scoped, file-backed)

All 17 "remaining" tasks carried a `threadID` mapping to a **subagent session** (not the orchestrator session):

| Task | Status (before cleanup) | threadID (owner session) | Subject |
|------|------------------------|--------------------------|---------|
| `T-32228094-ffad-4dfa-8879-b8326fabae5d` | in_progress | `ses_f65da9ee8ffe...` (planning session) | Tiers to model presets refactor (parent) |
| `T-65fbff7c-10af-441a-8359-bed00aa280d4` | in_progress | `ses_f658f7b34ffe...` (dead mouse) | T6: delegate-task preset overlay |
| `T-dccb56b0-ef3a-4204-b8ba-dcc2347f9261` | in_progress | `ses_f6584c5bfffe...` (dead mouse) | T9: atomic tier-removal sweep |
| `T-7e22c56e-b961-46e2-8813-3569b65ce7c6` | pending | `ses_f657a174fffe...` (dead mouse) | T12: ConfigError fail-fast |
| `T-fd4decf5-5b60-4f4a-b9c2-3772aa0c9e17` | pending | `ses_f65704c18ffe...` (dead mouse) | T12: ConfigError fail-fast (DUPLICATE) |
| `T-bba54094-4189-4e4a-ad25-2197f6eaecca` | in_progress | `ses_f657a174fffe...` (dead mouse) | T11: preset-wizard + setup wiring |
| `T-2e158b2a-1ccd-420b-8850-434da4790cfe` | in_progress | `ses_f65704c18ffe...` (dead mouse) | T11: preset wizard (DUPLICATE) |
| `T-0e28c6a0-3061-4005-8677-e81a69ea0399` | in_progress | `ses_f65da9ee8ffe...` (planning session) | Preset tests + full verification |
| `T-0c1e05a3-f30d-4953-a053-ca77179729fc` | pending | `ses_f6565ff36ffe...` (dead mouse) | T18: new preset tests |
| `T-09165ade-f582-4906-ae17-d33386ae439b` | pending | `ses_f6565ff36ffe...` (dead mouse) | Verify full suite green |
| `T-e4fa8649-11fc-42ac-a7a0-02361b9070bd` | in_progress | `ses_f6565ff36ffe...` (dead mouse) | T17: update existing tests |
| `T-fd1ef29f-0cd4-4f31-9b0c-71b9f815976e` | pending | `ses_f655c4225ffe...` (dead mouse) | T17: agents tests tier refs |
| `T-9a7d7ef1-8ede-4f31-a066-db22dd7a60f2` | pending | `ses_f655c4225ffe...` (dead mouse) | T18: model-presets + applier tests |
| `T-9d8438f7-1a02-49ee-8c04-c80dac80db33` | pending | `ses_f655c4225ffe...` (dead mouse) | T18: preset-state/tool/wizard/overlay tests |
| `T-7c35c722-bc71-450b-8cd6-345c7456b2ff` | pending | `ses_f655c4225ffe...` (dead mouse) | T18: mock-heavy-list + full CI |
| `T-f3bb556d-22c9-414f-9b2c-2b5331f0be50` | in_progress | `ses_f655c4225ffe...` (dead mouse) | T17: delegate-task tests |
| `T-25c9c16e-e54b-4e66-bf20-14dd07f05c64` | in_progress | `ses_f6f5e889fffe...` (other workstream) | interactive-bash-session mass-abort |

### Work-completion evidence (contradicting the directive)

- `bash script/run-ci.sh` → **Steps: 7, Passed: 7, Failed: 0** (typecheck, lint, isolated mock-heavy tests, remaining tests, build, build-output verification).
- `bun test tests/plugin-config.test.ts tests/tools/delegate-task/tools.test.ts` → 137 pass, 0 fail (these were the two files with stale tier expectations, fixed earlier the same session).
- `T-fd1ef29f` (agents tests tier refs): verified comment-only — `tests/agents/utils.test.ts:1055,1127,1145` and `dynamic-agent-prompt-builder.test.ts:459` contain only `//` comments mentioning "tier", no tier configs.
- `T-25c9c16e` (interactive-bash-session, unrelated workstream): fix already present in code — `src/hooks/interactive-bash-session/hook.ts:119` has `if (state.tmuxSessions.size > 0)` gating `killAllTrackedSessionsLocal`, exactly as the task describes.

### Directive injection log (`/tmp/matrixx.log`)

The enforcer fired on `session.idle` counting the orphaned files as incomplete:

```
Injecting continuation {"sessionID":"...","incompleteCount":17}
```

## Analysis

1. **Subagents write to the shared project task store.** `task_create`/`task_update` persist to `.matrixx/tasks/T-{uuid}.json` via project-scoped `getTaskDir()`. Subagent sessions (Mouse) create their own work-breakdown tasks there; the orchestrator and the continuation enforcer read the same store. There is no per-session isolation of task files.

2. **Dead subagent sessions orphan their tasks.** When a subagent session terminates abnormally (provider outage → `task()` poll timeout, session vanishing), its task files are never marked `completed`. The subagent's final "all tasks marked completed" report refers to its own in-session tracking, not the persisted files.

3. **The enforcer cannot distinguish orphans from active work.** `src/hooks/task-continuation-enforcer/continuation-injection.ts` counts every incomplete task in the store (`getIncompleteTasks(filteredTasks)`). It has staleness detection (`isTaskStale`, `staleSuffix`, `staleNote`) but:
   - staleness only adds a note/suffix — stale tasks still count toward the directive;
   - the orphaned tasks were created the same day, so they were "fresh" and not even flagged stale.
   - There is **no filter by `threadID` session liveness** — a task whose owning session is dead is indistinguishable from active work.

4. **Duplicate tasks for the same plan step.** T11 and T12 each existed twice, created by two different subagent sessions (both spawned for the same plan step after the first died). No dedup by subject exists.

5. **Orchestrator never updated the parent task.** `T-32228094` (the refactor parent, created in the planning session) stayed `in_progress` because the orchestrator executed the waves directly + via subagents without flipping its status.

## Fix pointers (for a future session)

- **Enforcer: filter by owning-session liveness.** In `continuation-injection.ts`, before counting, drop tasks whose `threadID` session is no longer active (e.g., check the session store / message dir for recent activity, or treat sessions older than the stale window as dead). This directly prevents orphan-driven false directives.
- **Enforcer: make staleness a filter, not a note.** Consider excluding tasks with no activity > `staleAfterMs` from `freshIncompleteCount` (they are already surfaced in the `staleNote`).
- **Subagent task hygiene:** when a subagent session dies mid-work, the orchestrator should reconcile its orphaned tasks (mark `completed`/`deleted`) before continuing — or subagents should not create tasks in the shared store at all (use session-local tracking only).
- **Dedup:** consider subject-based dedup in `task_create` (same subject within a short window → reuse existing task) to prevent duplicate tasks for the same plan step.
- **Orchestrator discipline:** update the parent task status as waves complete, even when work is delegated.

## Key files

- `.matrixx/tasks/T-{uuid}.json` — file-backed task state (project-scoped, shared across sessions)
- `src/hooks/task-continuation-enforcer/continuation-injection.ts` — incomplete-task counting + directive injection (lines ~181-216)
- `src/features/task-storage/` — task read/write path (`getTaskDir`, `readJsonSafe`)
- `src/tools/delegate-task/` — subagent spawning (sessions whose deaths orphan tasks)
- `/tmp/matrixx.log` — directive injection evidence