# Task System: Engineering Specification

> **Scope:** Persistent, file-backed task management for Matrixx agent orchestration.
> **Audience:** Engineers evolving the task system: storage, tools, hooks, scheduling, and agent integration.
> **Version:** 2.6.10, verified against source. Canonical config now lives in `tasks.*` (`src/config/schema/tasks.ts`); `experimental.task_system` and `morpheus.tasks.*` remain as lower-precedence legacy fallbacks (see §3).

Every normative claim below traces to the source path cited beside it. Where behavior belongs to another doc, this spec cross-links instead of duplicating: hook internals → `docs/hooks.md`, orchestration and wave planning flow → `docs/orchestration.md`, command reference → `docs/command-reference.md`.

---

## 1. Purpose & Design Principles

The Task System replaces OpenCode's ephemeral session-memory todos with **file-backed tasks** that survive restarts, support explicit dependencies, and drive automatic parallelization.

### Design Principles

| Principle | Implication |
|-----------|-------------|
| **File is the source of truth** | No in-memory registry, no DB. One `T-{uuid}.json` per task in `getTaskDir()`. Stateless CRUD keeps reasoning and recovery simple. |
| **Atomicity over speed** | Every write is `write tmp + renameSync`. Lock file uses `wx` creation with stale eviction. Correctness under concurrent agents is non-negotiable. |
| **Additive dependencies** | `addBlocks`/`addBlockedBy` append via `Set`, never replace. Prevents races when two agents update deps concurrently. |
| **One task, one owner, one transition** | `task_update(in_progress)` immediately before work, `completed` immediately after. No batch completions. Enforced by prompt plus continuation hook. |
| **Blocked means schedulable** | `task_list` filters `blockedBy` to unresolved entries only. The scheduler can skip blocked tasks without an extra query. |
| **Graceful degradation** | `tasks.enabled=false` restores `TodoWrite`/`TodoRead` everywhere: tool registry, hooks, and prompts all switch on `isTaskSystemEnabled()`. |
| **Drop-in upgrade** | Enabling flips tool registry, hooks, agent prompts, and storage without touching agent business logic. |

---

## 2. System Overview

```
matrixx.jsonc
  tasks { enabled?, scope?, storage_path?, task_list_id?,
          stale_after_hours?, session_scoped?, pollTimeoutMs? }   (canonical)
  experimental.task_system / morpheus.tasks.* / task.pollTimeoutMs (legacy fallback)
            │
            ├─── Tool Registry (src/plugin/tool-registry.ts)
            │     if enabled → register 5 tools:
            │       task_create · task_get · task_list · task_update · task_cleanup
            │
            ├─── Hook Wiring (summaries here, internals in docs/hooks.md)
            │     ├─ createContinuationHooks  → taskContinuationEnforcer (event:idle, 2s countdown)
            │     ├─ createToolGuardHooks     → tasksTodowriteDisabler (tool.execute.before, BLOCKING)
            │     │                           → taskEditGuard (tool.execute.before, Write/Edit/Read/bash guard)
            │     └─ createSessionHooks       → taskResumeInfo (tool.execute.after, resume hint)
            │                                 → delegateTaskRetry, taskNotepad, emptyTaskResponseDetector
            │
            ├─── Agent Prompts (dynamic-agent-prompt-builder, morpheus/keymaker/mouse factories)
            │     enabled → task discipline; disabled → todo discipline
            │
            └─── Runtime
                  task_create  → lock → T-{uuid}.json (pending) → unlock
                  task_update  → lock → merge fields → validate → atomic write → unlock
                  task_list    → readdir → validate → filter active → resolve blockedBy
                  task_get     → readFile → validate
                  task_cleanup → readdir → filter completed + olderThan → unlink
```

### Component Map

| Component | Path | Disabled (`tasks.enabled=false`) | Enabled (`tasks.enabled=true`, default) |
|-----------|------|----------------------------------|------------------------------------------|
| Tool registry | `src/plugin/tool-registry.ts` | 0 task tools (todos only) | 5 task tools registered |
| `tasks-todowrite-disabler` | `src/hooks/tasks-todowrite-disabler/` | no-op | `tool.execute.before` throws on `TodoWrite`/`TodoRead` |
| `task-edit-guard` | `src/hooks/task-edit-guard/` | active (own patterns, not gated on task system) | same: blocks generic Write/Edit/Read on `.matrixx/plans`, plus bash mutation patterns on `.matrixx/plans` and `.matrixx/tasks` |
| Tool config (`tool-config-handler`) | `src/plugin-handlers/tool-config-handler.ts` | default | `todowrite:false`, `todoread:false` global plus per-agent `deny` |
| Agent prompts | `src/agents/`, `dynamic-agent-prompt-builder` | todo discipline | task discipline (`task_create`/`task_update` workflow) |
| Storage | `src/features/task-storage/storage.ts` | session memory (OpenCode Todo API) | file system (`.matrixx/tasks/` or global) |
| Continuation | `src/hooks/task-continuation-enforcer/`, `src/hooks/todo-continuation-enforcer/` | `todo-continuation-enforcer` only | `task-continuation-enforcer` plus `todo-continuation-enforcer` independently |
| Persistence | none | lost on restart | survives restart, migratable |
| Plan files | `src/tools/plan/` (plan_create/read/update/list/delete) | guarded the same either way | `.matrixx/plans/*.md` edited only via `plan_*` tools with `LINE#ID` anchors (see §9) |

---

## 3. Configuration

Canonical source: `TasksConfigSchema` in `src/config/schema/tasks.ts`. Resolution: `resolveTasksConfig()` in `src/shared/task-system-gating.ts`. Predicate: `isTaskSystemEnabled()` in the same file.

### 3.1 Master Gate: `tasks.enabled` (canonical)

```jsonc
// matrixx.jsonc
{
  "tasks": {
    "enabled": true // default true since v2.5.x; set false to restore TodoWrite
  }
}
```

- **Canonical predicate:** `isTaskSystemEnabled(config)` returns `resolveTasksConfig(config).enabled`. Never read config fields inline; always call this predicate.
- **Legacy fallbacks** (lower precedence, still parsed): `experimental.task_system`, `new_task_system_enabled`, then `TASK_SYSTEM_DEFAULT` (`true`). Explicit `tasks.enabled` always wins.
- **First-load migration:** a missing field is auto-set via the `_migrations` marker `task_system_default_true`; no user action needed.
- **Wiring:** `createContinuationHooks` and `createToolGuardHooks` gate `task-continuation-enforcer` and `tasks-todowrite-disabler` on this predicate. `task-edit-guard` and `task-resume-info` are unconditional (they match on their own path patterns).

### 3.2 Storage and Enforcer Options: `tasks.*`

```jsonc
{
  "tasks": {
    "storage_path": "/custom/path", // absolute path used verbatim; relative path joins cwd
    "task_list_id": "my-project",   // explicit list ID, alternative to ULTRAWORK_TASK_LIST_ID
    "scope": "project",             // "project" | "global"
    "stale_after_hours": 24,        // stale-task threshold for task-continuation enforcer
    "session_scoped": true,         // enforcer sees only current session + live subagents
    "pollTimeoutMs": 600000         // blocking task() poll budget, minimum 60000
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Master switch. When false, `task_*` tools are unregistered and the legacy todo enforcer is used instead. |
| `storage_path` | `string` | none | Absolute path used verbatim; relative path resolves as `join(cwd, storage_path)`. When set, bypasses `scope`/`listId` resolution. |
| `task_list_id` | `string` | none | Explicit list ID. Alternative to the `ULTRAWORK_TASK_LIST_ID` env var. Sanitized to `[a-zA-Z0-9_-]`. |
| `scope` | `"project" \| "global"` | `"project"` | `project` → `.matrixx/tasks` in the project root. `global` → `~/.config/opencode/tasks/{listId}` via `getOpenCodeConfigDir()`. |
| `stale_after_hours` | `int`, min 1 | `24` | Pending/in_progress tasks with no file activity for this many hours count as stale. Stale-only queues skip the continuation directive; mixed queues annotate stale entries. |
| `session_scoped` | `boolean` | `true` | When true, the task-continuation-enforcer only considers tasks created by the current session (or its live subagent sessions). When false, all project tasks count regardless of origin. |
| `pollTimeoutMs` | `number`, min 60000 | `600000` (10 min) | Poll timeout for blocking `task()` calls. Raise for agents that delegate to subagents with long wall times. |
| `claude_code_compat` | `boolean` | `false` | Legacy `morpheus.tasks` flag, reserved path-compatibility marker. No behavior is keyed on it in the current tree. |

Legacy mirror: `MorpheusTasksConfigSchema` in `src/config/schema/morpheus.ts` keeps `storage_path`, `task_list_id`, `scope`, `stale_after_hours`, `session_scoped` as fallbacks. Resolution order per key: `tasks.*` → `morpheus.tasks.*` → default. `task.pollTimeoutMs` falls back to `tasks.pollTimeoutMs` the same way.

### 3.3 Directory Resolution

Implemented in `getTaskDir()` plus `resolveTaskListId()` in `src/features/task-storage/storage.ts`.

**Priority for `listId`:**

1. `ULTRAWORK_TASK_LIST_ID` env (trimmed)
2. `config.tasks.task_list_id`, else legacy `config.morpheus.tasks.task_list_id` (trimmed)
3. `basename(process.cwd())`, sanitized

Sanitization is `sanitizePathSegment()`: every char outside `[a-zA-Z0-9_-]` becomes `-`; an empty result becomes `"default"`. There is no `CLAUDE_CODE_TASK_LIST_ID` lookup in the current source; do not set it.

**Priority for directory:**

```
if storage_path is absolute → storage_path
else if storage_path is relative → join(cwd, storage_path)
else if scope === "global" OR !directory → join(getOpenCodeConfigDir(), "tasks", sanitizedListId)
else → join(directory, ".matrixx", "tasks")   // default: project-scoped
```

`ensureDir()` (`mkdirSync -p`) runs before every read and write. `getProjectTaskDir(directory)` is the shorthand for the default branch.

### 3.4 Task List ID Verification

```bash
# Env override check (global scope only changes the path; project scope keeps .matrixx/tasks)
ULTRAWORK_TASK_LIST_ID=my-list opencode

# Log grep (after enabling the task system)
grep -E "task.*dir|getTaskDir|migrateLegacy" /tmp/matrixx.log | tail -n 100
```

---

## 4. Data Model

### 4.1 Two-Layer Type System

| Layer | File | Type | Notes |
|-------|------|------|-------|
| **Storage** | `src/features/task-storage/types.ts` | `Task` (`TaskSchema`) | Slim storage model. `id` is a plain string; `threadID` optional. `strict()`, unknown keys rejected. |
| **API** | `src/tools/task/types.ts` | `TaskObject` (`TaskObjectSchema`) | Tool I/O model. `blocks`/`blockedBy` default to `[]`; `threadID` is **required**. Alias `TaskSchema = TaskObjectSchema` exists for Claude-style compat. `strict()` likewise. |

**Mapping:** `TaskObject` is `Task` plus a required `threadID` (auto-set to the calling session ID), `repoURL`, and `parentID`. When evolving the model, add the field to the storage `TaskSchema` first, then extend `TaskObjectSchema`, keeping both in sync.

### 4.2 Schema Detail (`TaskObjectSchema`)

Source: `src/tools/task/types.ts`.

```typescript
TaskObjectSchema = z.object({
  id:          z.string(),                         // T-{uuid}, written by generateTaskId()
  subject:     z.string(),                         // imperative: "Implement auth"
  description: z.string(),                         // default ""
  status:      z.enum(["pending", "in_progress", "completed", "deleted"]),
  activeForm:  z.string().optional(),              // "Implementing auth"
  blocks:      z.array(z.string()).default([]),    // IDs this task blocks
  blockedBy:   z.array(z.string()).default([]),    // IDs that block this task
  owner:       z.string().optional(),              // agent name
  metadata:    z.record(z.string(), z.unknown()).optional(),
  repoURL:     z.string().optional(),
  parentID:    z.string().optional(),              // parent task for subtasks
  threadID:    z.string(),                         // REQUIRED, auto-set to context.sessionID
  projectRoot: z.string().optional(),              // auto-set to ctx.directory
}).strict()
```

**ID pattern:** `TASK_ID_PATTERN = /^T-[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/` (`src/tools/task/constants.ts`). That is `T-` followed by dash-separated alphanumeric segments. It rejects truncated IDs (`T-`), trailing dashes (`T-abc-`), and double dashes (`T-a--b`). `generateTaskId()` emits `T-{randomUUID()}` (`src/features/task-storage/storage.ts`). `task_get`/`task_update` run input IDs through `parseTaskId()` and return `{ error: "invalid_task_id" }` on mismatch.

**Input schemas** (same file):

- `TaskCreateInputSchema`: `subject` (required), `description?`, `activeForm?`, `blocks?`/`blockedBy?` (arrays of `TaskIdSchema`), `owner?`, `metadata?`, `repoURL?`, `parentID?` (`TaskIdSchema`). No `threadID`: the tool sets it from the session.
- `TaskUpdateInputSchema`: `id` (required, plain string; pattern-checked in the handler), `subject?`, `description?`, `status?`, `activeForm?`, `addBlocks?`/`addBlockedBy?` (arrays of `TaskIdSchema`), `owner?`, `metadata?`. The tool surface exposes `add*` additive fields, not full replacement. `repoURL`/`parentID` are stored model fields; set them at create time.
- `TaskGetInputSchema`: `id` (required, plain string; pattern-checked in the handler).
- `TaskListInputSchema`: `status?`, `parentID?` (both optional filters). Note the registered `task_list` tool surface exposes only `parentID` as a declared arg; `status` filtering is schema-level.

### 4.3 Status Lifecycle

```
           task_create
               │
               ▼
          ┌─────────┐
          │ pending │◄──────────────────────────────┐
          └────┬────┘                               │
               │ task_update({status:"in_progress"}) │
               ▼                                    │
        ┌──────────────┐                            │
        │ in_progress  │──task_update({status:"pending"})──┘ (re-queue)
        └──────┬───────┘
               │ task_update({status:"completed"})
               ▼
         ┌───────────┐
         │ completed │ ── task_cleanup({olderThan}) ──► unlinked
         └───────────┘
               │ task_update({status:"deleted"})
               ▼
         ┌─────────┐
         │ deleted │ (terminal; removed by manual cleanup)
         └─────────┘
```

- **Active** means `pending` or `in_progress`. `task_list` returns only active tasks (plus the schema-level `status` filter path).
- **Terminal** means `completed` or `deleted`. `task_cleanup` deletes only `completed` files (honoring `olderThan`); `deleted` marks terminal intent and is filtered the same way.
- **Discipline:** `in_progress` means exactly one task at a time per agent. Mark `in_progress` before work, `completed` immediately after, never batch completions.

### 4.4 Example JSON (`T-*.json`)

Matches `TaskObjectSchema` above (`threadID` present and required, `blocks`/`blockedBy` defaulted):

```json
{
  "id": "T-2a200c59-1a36-4dad-a9c3-3064d180f694",
  "subject": "Implement user authentication",
  "description": "Add JWT-based auth to API endpoints",
  "status": "pending",
  "activeForm": "Implementing user authentication",
  "blocks": [],
  "blockedBy": ["T-9f31c2aa-77b0-4e11-9c2d-41c8e5a6b012"],
  "owner": "morpheus",
  "threadID": "ses_abc123",
  "projectRoot": "/home/user/project",
  "metadata": { "priority": "high" }
}
```

---

## 5. Storage & Persistence

Source: `src/features/task-storage/storage.ts` unless noted.

### 5.1 Layout

```
# scope=project (default)
.matrixx/tasks/
  T-2a200c59-....json
  T-abc12345-....json
  .lock                         # ephemeral {id, timestamp}

# scope=global
~/.config/opencode/tasks/{sanitizedListId}/
  T-*.json
  .lock
```

There is no index file. The directory listing is the index; the `T-*.json` glob is the query. `listTaskFiles()` maps that glob to IDs.

### 5.2 Atomic Write Protocol

`writeJsonAtomic(path, data)`:

1. Serialize with `JSON.stringify(data, null, 2)`.
2. `writeFileSync(tmpPath, content)` where `tmpPath = path + ".tmp." + Date.now()`.
3. `renameSync(tmpPath, path)`, atomic on POSIX.
4. On failure, best-effort `unlinkSync(tmpPath)`; the caller surfaces `internal_error`.

Guarantee: readers never see a half-written file.

### 5.3 File Locking

`acquireLock(dir)` and `acquireLockWithRetry(dir)`:

- **Create:** `writeFileSync(.lock, JSON.stringify({id: uuid, timestamp: Date.now()}), {flag: "wx"})`. Fails with `EEXIST` when another writer holds the lock.
- **Stale eviction:** `STALE_LOCK_THRESHOLD_MS = 30000` (30 seconds). On `EEXIST`, the holder reads `.lock`; when `Date.now() - timestamp > 30s` (or the lock is unreadable), it unlinks `.lock` and retries once. This bounds deadlock from crashed agents at 30 seconds.
- **Release:** `release()` re-reads `.lock` and unlinks only when the stored `id` matches the holder's own `id`, so a slow holder never deletes a successor's lock. Releasing a failed acquisition is a no-op.
- **Retry:** `acquireLockWithRetry` (the `task_create` path) attempts up to 4 times with backoff sleeps of `15 * 2 ** attempt` ms (15, 30, 60), then returns `{ acquired: false }`. `task_update` uses single-attempt `acquireLock` and returns `{ error: "task_lock_unavailable" }` when contended; the caller retries.

### 5.4 Legacy Migration

`migrateLegacyTasksIfNeeded(config, directory)`:

- Triggers on `task_create` / `task_list` when the project dir is empty or missing and the legacy global dir holds `T-*.json` files.
- Copies each missing `T-*.json` (never overwrites). Logs `migrated N tasks`.
- One way only (global to project) and idempotent.

### 5.5 Session-Scoped Operations

Session helpers live in `src/features/task-storage/session-storage.ts`: thin wrappers over `storage.ts` plus `TaskObjectSchema` validation for session-scoped reads used by the continuation enforcer.

**Session liveness and orphans:** tasks carry `threadID` (owning session). Subagent sessions are tracked in `src/features/session-state/state.ts` via `registerSubagentSession` / `unregisterSubagentSession`; `getSubagentSessionIDs(parent)` returns **only live** subagent sessions. The enforcer's session filter (`filterTasksBySession` in `src/hooks/task-continuation-enforcer/todo.ts`) admits a task only when its `threadID` is the current session or a **live** subagent of it. Tasks orphaned by a dead subagent session are excluded from continuation directives. `unregisterSubagentSession` prunes both the live set and the parent map, so dead sessions never leak into the filter. When `tasks.session_scoped` is false, this filter is bypassed and all project tasks count.

---

## 6. Tool API: Five Tools

All five are `ToolDefinition` factories `createTask*(config, ctx)` in `src/tools/task/`, registered in `src/plugin/tool-registry.ts` when `isTaskSystemEnabled(config)`. Tool contexts take `ctx.directory` (project root) and `context.sessionID` (stamped as `threadID`).

### 6.1 `task_create`

Source: `src/tools/task/task-create.ts`.

**Input:** `TaskCreateInputSchema`: `subject` (required), `description?`, `activeForm?`, `blockedBy?`, `blocks?`, `owner?`, `metadata?`, `repoURL?`, `parentID?`.

**Output:** `{ task: { id, subject }, deduplicated? }` or `{ error: "task_lock_unavailable" | "validation_error" | "internal_error" }`.

**Behavior:**

1. Validate input (`TaskCreateInputSchema`).
2. `migrateLegacyTasksIfNeeded()` when the project dir is empty.
3. `acquireLockWithRetry(dir)` (4 attempts, backoff).
4. **Dedup:** scan existing `T-*.json` files. When a task with the same trimmed `subject`, same `projectRoot`, status `pending`/`in_progress`, and file mtime inside `DEDUP_WINDOW_MS` (10 minutes, `src/tools/task/constants.ts`) exists, return `{ task: { id, subject }, deduplicated: true }` with no new file.
5. `id = T-{randomUUID()}`; build the `TaskObject` with `status: "pending"`, `blocks`/`blockedBy` defaulting to `[]`, `threadID = context.sessionID`, `projectRoot = ctx.directory`.
6. Validate the full object (`TaskObjectSchema`).
7. `writeJsonAtomic(join(dir, id + ".json"), task)`.
8. `release()`.

**Invariants:** `id` unique; `status` always `pending` on create; `blockedBy`/`blocks` default to `[]`; the file appears atomically.

```typescript
task_create({ subject: "Build frontend" })                              // → { task: { id:"T-…", subject:"Build frontend" } }
task_create({ subject: "Integration tests", blockedBy:["T-001","T-002"] })
```

### 6.2 `task_get`

Source: `src/tools/task/task-get.ts`.

**Input:** `TaskGetInputSchema`: `id` (required string).

**Output:** `{ task: TaskObject | null }`, `{ error: "invalid_task_id" }` on pattern mismatch, or `{ error: "invalid_arguments" | "unknown_error" }`.

**Behavior:** validate `id` → `parseTaskId()` against `TASK_ID_PATTERN` → `readJsonSafe(join(dir, id + ".json"), TaskObjectSchema)` → return `null` when missing or malformed (not an error; the caller handles `null`).

### 6.3 `task_list`

Source: `src/tools/task/task-list.ts`.

**Input:** declared tool arg is `parentID?` (subtask filter). Schema level (`TaskListInputSchema`) also defines `status?`.

**Output:** `{ tasks: TaskSummary[], reminder: string }` where `TaskSummary = { id, subject, status, owner?, blockedBy, parentID? }` (summaries, not full `TaskObject`).

**Behavior:**

1. `readdirSync(dir)` → keep `T-*.json`.
2. Per file: `readJsonSafe` plus `TaskObjectSchema.safeParse`; silently skip invalid files.
3. Filter: drop `completed` and `deleted` (schema-level `status` aside); when `parentID` is set, keep only matching subtasks.
4. **Resolve blockers:** per active task, `blockedBy = blockedBy.filter(id => tasksById[id]?.status !== "completed")`. Missing blocker files count as unresolved (kept). This filtered field is the scheduling primitive.
5. Return summaries plus the reminder: `"1 task = 1 task. Maximize parallel execution…"`.

**Errors:** never throws on malformed files; skips them. Empty or missing dir returns `{ tasks: [] }`.

### 6.4 `task_update`

Source: `src/tools/task/task-update.ts`.

**Input:** declared tool args are `id` (required), `subject?`, `description?`, `status?`, `activeForm?`, `owner?`, `addBlocks?`, `addBlockedBy?`, `metadata?`.

**Output:** `{ task: TaskObject }` or `{ error: "invalid_task_id" | "task_not_found" | "task_lock_unavailable" | "validation_error" | "internal_error" }`.

**Behavior:**

1. Validate input; pattern-check `id`.
2. `acquireLock(dir)` (single attempt; contended → `task_lock_unavailable`).
3. Read the existing file → validate.
4. Apply updates:
   - Scalars (`subject`, `description`, `status`, `activeForm`, `owner`): direct replace when provided.
   - `addBlocks` / `addBlockedBy`: additive, `new Set([...existing, ...added])` (dedup, append-only).
   - `metadata`: shallow merge; a `null` value deletes that key, anything else sets it.
5. Re-validate against `TaskObjectSchema`.
6. `writeJsonAtomic` → `release()` (release runs in a `finally`).

**Critical:** dependencies are **additive only**. There is no `removeBlockedBy` or full replace; this is intentional to avoid races. To unblock a task, complete the blocker and let the `task_list` filter hide it. To change deps, set them in `task_create`.

```typescript
task_update({ id:"T-003", addBlockedBy:["T-001"] })          // additive
task_update({ id:"T-001", status:"completed" })               // unblocks T-003 via task_list filter
task_update({ id:"T-001", metadata:{ priority:null } })       // delete key
task_update({ id:"T-001", status:"in_progress", owner:"morpheus" })
```

### 6.5 `task_cleanup`

Source: `src/tools/task/task-cleanup.ts`.

**Input:** declared args are `olderThan?` (format `^(\d+)(d|h|m)$`, e.g. `"7d"`, `"24h"`, `"30m"`) and `all?` (delete all completed; default true when `olderThan` is unset). There is no per-`id` delete; removals are bulk by age and status.

**Output:** `{ deleted: number, remaining: number, deletedIds: string[] }`, or `{ error: "validation_error", message }` on a bad `olderThan` string.

**Behavior:**

1. `readdirSync(dir)` → parse each `T-*.json` (skip invalid; continue past unreadable files).
2. Keep only `status === "completed"` (never touches `pending`, `in_progress`, or `deleted`).
3. When `olderThan` is set: `parseOlderThan(s)` → ms; per completed task, `getTaskTimestamp(task)` reads `time_updated ?? time_created ?? updatedAt ?? createdAt ?? timeUpdated ?? timeCreated`, coerces numerics, and falls back to `Date.now()`; keep only tasks with `Date.now() - ts > threshold`.
4. `unlinkSync` each selected file; log individual failures and continue.
5. Return counts.

**Invariants:** only `completed` files are deleted; malformed files are ignored; empty `olderThan` deletes all completed.

```typescript
task_cleanup({ olderThan:"7d" })   // delete completed older than 7 days
task_cleanup({})                    // delete all completed
```

### 6.6 Error Contract

| Code | Tool | Cause | Caller action |
|------|------|-------|---------------|
| `invalid_task_id` | `task_get`, `task_update` | `id` fails `TASK_ID_PATTERN` | Fix the ID |
| `task_not_found` | `task_update` | file missing | Check `task_list` |
| `task_lock_unavailable` | `task_create`, `task_update` | `.lock` held and not stale | Retry after backoff |
| `validation_error` / `invalid_arguments` | any | Zod parse fails (strict schemas) | Fix the payload |
| `internal_error` / `unknown_error` | `task_create`, `task_update`, `task_cleanup`, `task_get` | FS error, atomic-write failure, unexpected throw | Check `/tmp/matrixx.log` |

Tool errors return as `{ error, message? }` JSON; they are never thrown to the model. Hooks are the exception: blocking hooks `throw` to stop `TodoWrite` or raw bash edits.

---

## 7. Dependencies & Scheduling

### 7.1 Semantics

- `blocks: string[]` lists IDs this task blocks (forward edge). Informational; `task_list` does not filter on it.
- `blockedBy: string[]` lists IDs blocking this task (backward edge). **This is the scheduling edge**: `task_list` resolves it to unresolved entries only.
- **Bidirectional sync:** `src/tools/delegate-task/sync-task-deps.ts` keeps the reverse edge consistent: after `task_create({blockedBy:[T-1]})`, the caller also updates `T-1` with `addBlocks:[newId]`. Storage does not enforce this; it is convention (see `docs/orchestration.md` for the delegation flow).

### 7.2 Additive Merge

`task_update` merges `addBlocks`/`addBlockedBy` through `Set([...old, ...added])`. There is no removal API. Rationale: two agents adding deps concurrently would otherwise clobber each other. Current discipline for evolving a graph is "complete the blocker" rather than rewriting edges.

### 7.3 Unresolved Filter (Scheduler Primitive)

Source: `src/tools/task/task-list.ts`. Per active task:

```typescript
const unresolvedBlockedBy = task.blockedBy.filter((blockerId) => {
  const blocker = allTasks.find((t) => t.id === blockerId)
  return blocker?.status !== "completed"   // missing blocker file counts as unresolved
})
```

A missing blocker ID (deleted file) stays unresolved. Defend against stale IDs by completing blockers rather than deleting them before dependents finish.

### 7.4 Wave Planning (Morpheus Discipline)

Morpheus decomposes work into **waves** that maximize parallelism. Full flow, examples, and the delegate integration live in `docs/orchestration.md`; the storage-level rules are:

1. Create independent tasks first (`blockedBy: []`); they can run in parallel.
2. Set `blockedBy` only when the task truly needs the blocker's output.
3. Keep chains short; every edge is a serialization point.
4. Check `task_list()` after each wave; `blockedBy: []` on a `pending` task means runnable now.
5. **Orchestrator discipline:** update the parent task status as each wave completes, even when the work was delegated. A parent left `in_progress` after its work finished keeps the enforcer firing.
6. **Reconcile dead subagents:** when a subagent session dies mid-work, mark its orphaned tasks `completed`/`deleted` before continuing. The enforcer excludes tasks owned by dead sessions, but reconciliation keeps the store honest.

```typescript
// Wave 1: parallel
const t1 = task_create({ subject:"Build frontend" })   // T-001
const t2 = task_create({ subject:"Build backend" })    // T-002
// Wave 2: blocked
const t3 = task_create({ subject:"Integration tests", blockedBy:[t1.task.id, t2.task.id] })
// Execute wave 1 in parallel via delegate_task, then:
task_update({ id:t1.task.id, status:"completed" })
task_update({ id:t2.task.id, status:"completed" })
// task_list now shows T-003 with blockedBy:[] → runnable
task_update({ id:t3.task.id, status:"in_progress", owner:"morpheus" })
// ... work ...
task_update({ id:t3.task.id, status:"completed" })
```

---

## 8. Hooks & Continuation

One-paragraph summaries here. Full hook internals (state machines, prompts, countdown mechanics) belong to `docs/hooks.md`.

### 8.1 `task-continuation-enforcer`: Auto-Continue While Tasks Remain

**Files:** `src/hooks/task-continuation-enforcer/` (`handler.ts`, `idle-event.ts`, `continuation-injection.ts`, `countdown.ts`, `session-state.ts`, `staleness.ts`, `todo.ts`, `abort-detection.ts`, `message-directory.ts`, `non-idle-events.ts`, `types.ts`, `constants.ts`).

**Wiring:** `src/plugin/hooks/create-continuation-hooks.ts`, gated on `isTaskSystemEnabled(config)` plus `isHookEnabled("task-continuation-enforcer")`. **Trigger:** `event:idle` (session idle).

**Constants** (`constants.ts`): `HOOK_NAME = "task-continuation-enforcer"`, `DEFAULT_SKIP_AGENTS = ["oracle", "compaction"]`, `COUNTDOWN_SECONDS = 2`, `TOAST_DURATION_MS = 900`, `COUNTDOWN_GRACE_PERIOD_MS = 500`, `ABORT_WINDOW_MS = 3000`, `CONTINUATION_COOLDOWN_MS = 30_000`, `MAX_CONSECUTIVE_FAILURES = 5`, `FAILURE_RESET_WINDOW_MS = 5 * 60 * 1000` (5 min).

**Behavior:** on idle, the handler skips during recovery, right after an abort, while background tasks run, when continuation is stopped, past the failure circuit breaker, or inside cooldown. Otherwise it counts incomplete tasks: zero → done; all stale → skip with a log line; otherwise a 2-second countdown injects the `CONTINUATION_PROMPT` directive (work next pending task, mark `in_progress`/`completed`, respect `blockedBy`). Injection failures increment the consecutive-failure counter.

**Cross-session scope and liveness:** the enforcer reads the project-wide store, so a directive reflects the union of sessions in the project. With `tasks.session_scoped: true` (default), tasks are admitted only when their `threadID` is the current session or a live subagent of it; orphaned tasks from dead sessions are excluded. Pre-migration tasks without `threadID` are always included. Stale handling keys on `tasks.stale_after_hours` (default 24): all-stale queues skip on both the idle path and the post-countdown injection path; mixed queues annotate stale entries with a `(stale: Nh)` suffix plus an orphan-suspect note.

**Subtask rollup:** a task with `parentID` is a subtask. Subtasks whose parent is `completed`/`deleted` count as resolved and leave the incomplete set (`dropSubtasksWithResolvedParent` in `todo.ts`, applied before session filtering on both paths). A parent with incomplete subtasks stays incomplete through its own status.

### 8.2 `tasks-todowrite-disabler`: Enforce Task System

**Files:** `src/hooks/tasks-todowrite-disabler/` (`hook.ts`, `constants.ts`). **Type:** `tool.execute.before`, **BLOCKING** (throws). **Trigger:** `tool in ["TodoWrite", "TodoRead"]` when `isTaskSystemEnabled(config)`.

**Triple-layer enforcement:**

| Layer | Mechanism | Location |
|-------|-----------|----------|
| Hook | `throw` on `TodoWrite`/`TodoRead` | `hooks/tasks-todowrite-disabler/hook.ts` |
| Global tool config | `todowrite:false`, `todoread:false` | `plugin-handlers/tool-config-handler.ts` |
| Per-agent config | `todowrite:"deny"`, `todoread:"deny"` on task agents | same handler |

**Error message** (`REPLACEMENT_MESSAGE` in `constants.ts`) teaches the 4-step workflow: `TaskCreate` → `TaskUpdate(in_progress)` → work → `TaskUpdate(completed)`, with "1 task = 1 task" parallelism and "do not retry TodoWrite" instruction.

### 8.3 `task-edit-guard`: Block Raw Edits

**Files:** `src/hooks/task-edit-guard/` (`hook.ts`, `constants.ts`). **Type:** `tool.execute.before`. **Unconditional** (not gated on the task system; it matches on its own path patterns).

Three blocks:

1. Generic `Write`/`Edit` to any path containing `.matrixx/plans` → throw `PLAN_WRITE_WARN`, directing to `plan_create`/`plan_read`/`plan_update`/`plan_list`/`plan_delete`.
2. Generic `Read` of any path containing `.matrixx/plans` → throw `PLAN_READ_WARN`, directing to `plan_read` (hashline-tagged output) plus `plan_list` for discovery.
3. `bash` commands matching `BLOCKED_PATTERNS` (`constants.ts`): `sed`, `python3?`, `echo`, `cat >`, `mv`, `rm` (tasks `T-*.json` and plans), `cp`, `tee`, `touch`, `truncate`, `printf`, each scoped to `.matrixx/plans` or `.matrixx/tasks` paths. Pure `grep` reads that hit no pattern pass through via the `isOnlyGrep` fast path.

### 8.4 `task-notepad`, `task-resume-info`, and Siblings

| Hook | Trigger | Behavior |
|------|---------|----------|
| `task-notepad` (`src/hooks/task-notepad/`) | session start | Injects a `.matrixx/tasks` context fragment (task counts) into the prompt |
| `task-resume-info` (`src/hooks/task-resume-info/`) | `tool.execute.after` for delegate targets | Extracts `session_id` via `SESSION_ID_PATTERNS`, appends `to continue: task(session_id="…")` unless present; ignores `Error:` outputs. Always registered (`create-session-hooks.ts`). |
| `empty-task-response-detector` (`src/hooks/empty-task-response-detector.ts`) | response analysis | Detects an empty assistant message while tasks remain; triggers a re-prompt |
| `delegate-task-retry` (`src/hooks/delegate-task-retry/`) | `delegate_task` failure | Retries transient LLM failures via pattern matching in `patterns.ts` |
| `todo-continuation-enforcer` (`src/hooks/todo-continuation-enforcer/`) | session idle (todo mode) | Sibling system for `SessionTodo`: same countdown shape, counts todos not tasks. Both enforcers run independently when enabled. |

### 8.5 `task-toast-manager`: Background-Task Toasts

**Files:** `src/features/task-toast-manager/` (`manager.ts`, `types.ts`, `index.ts`).

`TaskToastManager` tracks **delegated background agent tasks** (the `delegate_task` background path), not file-backed `T-*.json` rows. Entries are `TrackedTask` records: `{ id, description, agent, status, startedAt, isBackground, category?, skills?, modelInfo? }` with status in `running | queued | completed | error` (`types.ts`). Lifecycle: `addTask()` on launch (shows a toast), `updateTask()` on status change, `removeTask()` when a task completes or errors, `getRunningTasks()` / `getQueuedTasks()` for TUI surfacing. Toast display options are `TaskToastOptions` (`title`, `message`, `variant`, `duration?`).

---

## 9. Plans: `.matrixx/plans/*.md` Conventions

Plans are markdown files managed **only** through the `plan_*` tools (`src/tools/plan/`: `plan-create.ts`, `plan-read.ts`, `plan-update.ts`, `plan-list.ts`, `plan-delete.ts`). Generic `Read`/`Write`/`Edit` on `.matrixx/plans` is blocked by `task-edit-guard` (see §8.3); raw bash mutation of plans is blocked by the same hook's `BLOCKED_PATTERNS`.

- **Discovery:** `plan_list` lists plan files; `plan_read` returns hashline-tagged output where each line carries a `LINE#ID` anchor.
- **Edits:** `plan_update` takes hashline edits (`pos`/`end` in `LINE#ID` format; `replace` requires a `pos` anchor). Edits are scoped to the plans dir and validated before write.
- **Task checkboxes:** plan bodies use markdown checkboxes. Numbered task items (`1. [ ] …` / `1. [x] …`) are progress-tracked items; plain `- [ ]` bullets mark meta items (definition of done, final checklist) that do not count toward numeric progress. Keep the two shapes distinct so progress readers count only numbered tasks.
- **Task files stay separate:** `.matrixx/tasks/T-*.json` rows are runtime state edited only via `task_*` tools; plan files are human-readable intent edited only via `plan_*` tools. Never hand-edit either with bash.

---

## 10. Commands & TUI

| Command | Template | Tool called | Behavior |
|---------|----------|-------------|----------|
| `/task-list` | `src/features/builtin-commands/templates/task-list.ts` | `task_list` | Renders `TaskList` summaries. Ignores global `search-mode`. |
| `/cleanup-tasks` | `src/features/builtin-commands/templates/cleanup-tasks.ts` | `task_cleanup` | Deletes completed tasks. Also ignores global `search-mode`. |

Full command reference lives in `docs/command-reference.md`. TUI behavior: completed tasks are hidden; only active tasks display.

---

## 11. Cross-Cutting Concerns

### 11.1 Gating: Single Predicate

Source: `src/shared/task-system-gating.ts`.

```typescript
export const TASK_SYSTEM_DEFAULT = true as const
export function resolveTasksConfig(config) { /* tasks.* wins; legacy fills gaps */ }
export function isTaskSystemEnabled(config): boolean {
  return resolveTasksConfig(config).enabled
}
```

Used by: `create-continuation-hooks`, `create-tool-guard-hooks`, `tasks-todowrite-disabler`, `tool-registry`. Never read `config.experimental.task_system` or `config.tasks.enabled` directly; always go through `isTaskSystemEnabled` (enablement) or `resolveTasksConfig` (full options).

### 11.2 Compatibility Notes

- **Claude Code alignment:** field names (`subject`, `blockedBy`, `blocks`) follow Claude Code's Task tool shape. Matrixx's `TaskObject` is a superset (adds `activeForm`, `repoURL`, `parentID`, atomic storage, additive deps, metadata merge, `task_cleanup`).
- **No `morpheus.tasks.enabled`:** the legacy `MorpheusTasksConfigSchema` has no `enabled` field. The switch is `tasks.enabled` (canonical) with `experimental.task_system` / `new_task_system_enabled` as fallbacks. Do not add `enabled` under `morpheus.tasks`.
- **Removed `todo-sync.ts` dual-write:** bulk Task→Todo mirroring (`syncAllTasksToTodos` / `syncTaskTodoUpdate`, formerly `src/tools/task/todo-sync.ts`) was removed when the enforcers decoupled. Do not reintroduce dual-write without revisiting that rationale.

---

## 12. Implementation Map

| File | Purpose |
|------|---------|
| `src/tools/task/task-create.ts` | `task_create`: lock + `T-{uuid}` + dedup + atomic write |
| `src/tools/task/task-get.ts` | `task_get`: read single JSON + validate, `null` when missing |
| `src/tools/task/task-list.ts` | `task_list`: readdir + filter active + resolve blockedBy to unresolved |
| `src/tools/task/task-update.ts` | `task_update`: additive deps + metadata merge + atomic write |
| `src/tools/task/task-cleanup.ts` | `task_cleanup`: delete completed + `olderThan` age filter |
| `src/tools/task/types.ts` | Zod schemas (`TaskObjectSchema`, `TaskCreate/Update/Get/ListInputSchema`, `TaskIdSchema`) |
| `src/tools/task/constants.ts` | `TASK_ID_PATTERN`, `DEDUP_WINDOW_MS` (10 min) |
| `src/tools/task/index.ts` | Barrel re-exports |
| `src/features/task-storage/storage.ts` | `getTaskDir`, `resolveTaskListId`, `sanitizePathSegment`, `readJsonSafe`, `writeJsonAtomic`, `acquireLock`, `acquireLockWithRetry`, `generateTaskId`, `listTaskFiles`, `migrateLegacyTasksIfNeeded`; `STALE_LOCK_THRESHOLD_MS = 30000` |
| `src/features/task-storage/types.ts` | Storage `TaskSchema` / `Task` type |
| `src/features/task-storage/session-storage.ts` | Session-scoped read helpers |
| `src/features/task-toast-manager/manager.ts` | Background-task toast lifecycle |
| `src/features/task-toast-manager/types.ts` | `TrackedTask`, `TaskStatus` (`running\|queued\|completed\|error`), `TaskToastOptions` |
| `src/tools/plan/plan-read.ts`, `plan-update.ts` | `plan_read` (hashline output), `plan_update` (`LINE#ID` edits) |
| `src/hooks/task-continuation-enforcer/` | Enforcer factory, idle handler, injection, countdown, staleness, session filter |
| `src/hooks/tasks-todowrite-disabler/` | BLOCKING hook on `TodoWrite`/`TodoRead` + `REPLACEMENT_MESSAGE` |
| `src/hooks/task-edit-guard/` | Write/Edit/Read + bash guard for `.matrixx/plans` and `.matrixx/tasks` |
| `src/hooks/task-notepad/` | Task context fragment injection |
| `src/hooks/task-resume-info/` | Resume hint `task(session_id="…")` |
| `src/hooks/todo-continuation-enforcer/` | Sibling Todo enforcer (independent) |
| `src/tools/delegate-task/sync-task-deps.ts` | Bidirectional dep sync |
| `src/config/schema/tasks.ts` | Canonical `TasksConfigSchema` |
| `src/config/schema/morpheus.ts` | Legacy `MorpheusTasksConfigSchema` fallback |
| `src/config/schema/experimental.ts` | Legacy `task_system` fallback |
| `src/config/schema/hooks.ts` | `HookNameSchema` (includes `task-continuation-enforcer`, `tasks-todowrite-disabler`, `task-edit-guard`, etc.) |
| `src/plugin/tool-registry.ts` | Conditional registration of the 5 task tools |
| `src/plugin/hooks/create-continuation-hooks.ts` | Gates `taskContinuationEnforcer` |
| `src/plugin/hooks/create-tool-guard-hooks.ts` | Gates `tasksTodowriteDisabler` |
| `src/plugin/hooks/create-session-hooks.ts` | Registers `taskResumeInfo` (always) |
| `src/shared/task-system-gating.ts` | `resolveTasksConfig`, `isTaskSystemEnabled`, `TASK_SYSTEM_DEFAULT` |
| `src/features/builtin-commands/templates/task-list.ts` | `/task-list` command |
| `src/features/builtin-commands/templates/cleanup-tasks.ts` | `/cleanup-tasks` command |

**Key dependencies:** `zod@4` (schemas), `@opencode-ai/plugin` (tool framework, `PluginInput`), `node:crypto` (`randomUUID`), `node:fs` (atomic ops), `node:path`.

---

## 13. Evolution Guide

### Adding a Field to `Task`

1. Add to `src/features/task-storage/types.ts: TaskSchema` (storage layer).
2. Add to `src/tools/task/types.ts: TaskObjectSchema` (API layer); keep them in sync.
3. Update `task_create` defaults and `task_update` apply logic when the field is mutable.
4. Update `task_list` / `task_get` return mapping when it should appear in summaries.
5. Run `bun run typecheck && bun run lint && bun test`.
6. Update this doc (§4.2, §6, §12) and `matrixx.example.jsonc` when config-adjacent.

### Adding a New Tool or Hook

- **Tool:** new file `src/tools/task/task-*.ts` + Zod input schema in `types.ts` + barrel in `index.ts` + registration in `src/plugin/tool-registry.ts` + hook wiring when needed + tests alongside source (`*.test.ts` with `//#given` `//#when` `//#then`).
- **Hook:** new dir `src/hooks/<name>/` + entry in `HookNameSchema` (`src/config/schema/hooks.ts`) + factory `createXxxHook` + registration in the matching `src/plugin/hooks/create-*-hooks.ts` + `isTaskSystemEnabled` gate when task-related.

### Invariants to Preserve

- **Strict schemas:** storage `TaskSchema` and `TaskObjectSchema` are `.strict()`; unknown keys are rejected. Do not loosen.
- **Additive deps only:** `addBlocks`/`addBlockedBy` merge through `Set`. No full replace, no inline removal.
- **Atomic writes:** always `writeJsonAtomic` (tmp + rename). Never `writeFileSync` directly to `T-*.json`.
- **Lock verification:** `release()` checks holder `id` before unlink. Never delete `.lock` unconditionally. Stale threshold is 30 s; do not lengthen without contention data.
- **Single owner:** one `in_progress` task per agent at a time (prompt invariant the enforcer assumes).
- **Unresolved filter is the scheduler:** `task_list` must filter `blockedBy` to unresolved entries; changing this breaks wave planning.
- **Liveness filter:** `getSubagentSessionIDs` returns only live subagent sessions; `filterTasksBySession` must never admit tasks owned by dead sessions (prevents false continuation directives). `tasks.session_scoped: false` is the only bypass.
- **Gating via predicate:** always `isTaskSystemEnabled(config)` / `resolveTasksConfig(config)`; never read config fields inline.
- **No bash edits:** `.matrixx/tasks/T-*.json` and `.matrixx/plans/*.md` are guarded by `task-edit-guard`; use `task_*` and `plan_*` tools.

### Testing

- **Mock-heavy isolation:** tests with `mock.module()` run isolated. Add new such files to both `.github/workflows/ci.yml` and `publish.yml` mock-heavy lists and the `grep -v -F` exclusion in `script/run-ci.sh`. Source of truth: `script/run-ci.sh`.
- **Preload:** `tests/test-setup.ts` calls `_resetForTesting()` before each test.
- **Existing suites:** `src/tools/task/task-cleanup.test.ts`, `src/features/task-storage/*.test.ts`, `src/hooks/task-continuation-enforcer/*.test.ts` (`awaiting-user`, `continuation-injection`, `countdown`, `idle-event`, `staleness`, `todo`, `ulw-bootstrap`), `src/shared/task-system-gating.test.ts`, `tests/e2e-smoke-task-system.test.ts`.

---

## 14. Appendix: History & Decisions

| Date / Commit | Change | Rationale |
|---------------|--------|-----------|
| `d004d84` feat(hooks): mirror Task→Todo | Initial file→Todo API mirror | Tasks visible in OpenCode TUI |
| `72abccb` / `401f336` | Direct DB fallback + debounce | Reliability under TUI load |
| `0798df4` host-blessed `SessionTodo.Service` dual-write | Correct writer via `PluginInput` | Align with OpenCode SDK |
| `4e694d0` migrate to project-scoped storage | `.matrixx/tasks` default; global only when `scope=global` | Project isolation, no cross-project leakage |
| `0682bce` isolation suite (11 tests) | Verify project isolation | n/a |
| `d16dc27` `task-edit-guard` | Block raw bash on `.matrixx/tasks` and `.matrixx/plans` | Prevent bypass of locking and validation |
| `3d44108` hide completed from TUI | TUI shows only active tasks | Reduce noise |
| `d8ca206` decouple `task-continuation-enforcer` from `todo-continuation-enforcer` | Dedicated enforcer per system; remove `todo-sync.ts` dual-write | Enforcers independent; no coupling debt |
| `62e7061` wire enforcer to event bus and correct injection | `handleSessionIdle` via `onAbort`/`onRecoveryComplete` callbacks | Abort-aware, background-task-aware continuation |
| `5459ef9` merge `feat/task-system-no-todowrite` | Remove stale specs, repair compaction | n/a |
| `75fedac` default `task_system=true` + canonical gating | `isTaskSystemEnabled` + `_migrations` marker | Zero-config for fresh clones |
| `8509b84` to `82f9f38` `/task-list` and `/cleanup-tasks` search-mode fixes | Ignore global `search-mode` | Commands must not leak into global search |
| task config consolidation (2.6.x) | Canonical `tasks.*` section; `experimental.task_system`, `morpheus.tasks.*`, `task.pollTimeoutMs` become fallbacks via `resolveTasksConfig()` | One home for task config; keeps old files parsing |

**Known tech debt:**

- No dedicated `TaskManager` class: CRUD is stateless I/O plus `.lock`. Intentional simplicity; do not introduce a manager unless contention profiling justifies it.

---

*End of Task System Engineering Specification. For hook internals see `docs/hooks.md`; for orchestration see `docs/orchestration.md`; for commands see `docs/command-reference.md`; for config reference see `docs/configurations.md`.*
