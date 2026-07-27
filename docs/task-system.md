# Task System

Matrixx's Task system provides structured, persistent task management with dependency tracking, parallel execution optimization, and automatic synchronization with the OpenCode Todo API. It is an **opt-in** replacement for the legacy `TodoWrite`/`TodoRead` mechanism.

---

## Overview

The Task System replaces OpenCode's ephemeral session-memory todos with file-backed tasks that survive session restarts, support dependencies (`blockedBy`/`blocks`), and enable automatic parallel execution optimization.

### Key Capabilities

- **Persistence**: Tasks stored as JSON files in `~/.config/opencode/tasks/{listId}/` — survive session restarts
- **Dependencies**: Full `blockedBy`/`blocks` support for task ordering
- **Parallel execution**: Tasks with empty `blockedBy` automatically runnable in parallel
- **Todo sync**: Bidirectional sync between tasks and the OpenCode Todo API
- **Atomic writes**: Temp-file + rename pattern with file-based locking (30s stale threshold)
- **Agent awareness**: All agents (Morpheus, Keymaker, Mouse variants) have dual-mode prompts that adapt when the task system is enabled
- **Graceful degradation**: Falls back to `TodoWrite`/`TodoRead` when disabled — no code changes needed

---

## Configuration

### Enabling the Task System

The task system is gated behind the `experimental.task_system` flag. Add this to your `matrixx.jsonc`:

```jsonc
{
  "experimental": {
    "task_system": true
  }
}
```

> **Note**: There is also a root-level `new_task_system_enabled` field in the config schema. This field is **not consumed** by any runtime code — it is a planned field that was never wired up. Use `experimental.task_system` instead.

### Task Storage Options

Under `morpheus.tasks`, you can configure storage behavior:

```jsonc
{
  "morpheus": {
    "tasks": {
      "storage_path": "/custom/path",
      "task_list_id": "my-project",
      "claude_code_compat": false
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `storage_path` | `string` | `~/.config/opencode/tasks/{listId}/` | Absolute or relative path override for task storage |
| `task_list_id` | `string` | `basename(process.cwd())` | Force a task list ID (alternative to env var) |
| `claude_code_compat` | `boolean` | `false` | Enable Claude Code path compatibility mode |

### Task List ID Resolution

The task list ID (used as the storage subdirectory name) resolves with this priority:

1. `ULTRAWORK_TASK_LIST_ID` environment variable
2. `CLAUDE_CODE_TASK_LIST_ID` environment variable
3. `config.morpheus.tasks.task_list_id` configuration option
4. `basename(process.cwd())` — the current working directory name

All IDs are sanitized to `[a-zA-Z0-9_-]` characters only.

---

## Architecture

The task system integrates into Matrixx at multiple layers:

```
matrixx.jsonc
  experimental.task_system: true
            |
            v
  Tool Registry (tool-registry.ts)
  ---------------------------------
  Conditionally registers 4 task tools:
  task_create, task_get, task_list, task_update
            |
            +---> TodoWrite Disabler Hook (tasks-todowrite-disabler/)
            |     tool.execute.before -- BLOCKS TodoWrite/TodoRead
            |     Forces agents to use TaskCreate/TaskUpdate instead
            |
            +---> Tool Config (tool-config-handler.ts)
            |     Global: todowrite: false, todoread: false
            |     Per-agent (morpheus, keymaker, architect, oracle, mouse):
            |       todowrite: "deny", todoread: "deny"
            |
            +---> Agent Config (agent-config-handler.ts)
            |     useTaskSystem=true -> flows to all agent factories
            |     Agent prompts rewrite: todos -> tasks
            |
            +---> Runtime Execution
                  Agent calls task_create -> writes JSON file + lock + sync to Todo API
                  Agent calls task_update -> updates JSON + merge deps + sync
                  Agent calls task_list -> reads directory, filters active, resolves blockers
                  Agent calls task_get -> reads single JSON file
```

### Dual-Mode Design

Every component that touches task tracking has a **dual-mode** design. A single `useTaskSystem` boolean (propagated from the config) switches between task-based and legacy todo-based behavior. This makes the task system a "drop-in upgrade" — enabling it transforms the entire agent experience without any code changes to individual agent prompts.

### Component Map

| Component | Task System Disabled | Task System Enabled |
|-----------|---------------------|---------------------|
| Tool registry | Todos only | 4 task tools registered |
| TodoWrite hook | No-op | BLOCKING (throws error) |
| Tool config | Default | todowrite/todoread denied |
| Agent prompts | Todo instructions | Task instructions |
| Storage | Session memory | File system |
| Persistence | Lost on close | Survives restart |

---

## Tools Reference

### task_create

Create a new task with an auto-generated `T-{uuid}` ID. Records the session ID as `threadID` and sets status to `"pending"`. Writes the task JSON file atomically and syncs to the OpenCode Todo API.

**Args:**

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `subject` | `string` | Yes | Task subject/title (imperative form) |
| `description` | `string` | No | Task description |
| `activeForm` | `string` | No | Present continuous form ("Running tests") |
| `blockedBy` | `string[]` | No | Task IDs that must complete before this task |
| `blocks` | `string[]` | No | Task IDs this task blocks |
| `metadata` | `Record<string, unknown>` | No | Arbitrary task metadata |
| `repoURL` | `string` | No | Repository URL |
| `parentID` | `string` | No | Parent task ID (for sub-tasks) |

**Returns:** `{ task: { id: string, subject: string } }`

**Example:**

```typescript
// Create a task with a dependency
task_create({
  subject: "Implement user authentication",
  description: "Add JWT-based auth to API endpoints",
  blockedBy: ["T-abc123"]  // Wait for database migration
})
// -> { task: { id: "T-2a200c59-1a36-4dad-a9c3-3064d180f694", subject: "Implement user authentication" } }
```

**Internal operations:**

1. Validates input against `TaskCreateInputSchema` (Zod)
2. Acquires a file-based lock on the task directory (30s stale threshold)
3. Generates a `T-{uuid}` ID via `crypto.randomUUID()`
4. Constructs a `TaskObject` with default `blocks: []`, `blockedBy: []`, `status: "pending"`
5. Validates the full task object against `TaskObjectSchema`
6. Writes the JSON file atomically (temp + rename)
7. Releases the lock
8. Syncs to the OpenCode Todo API via `syncTaskTodoUpdate()`

---

### task_get

Retrieve a full task object by ID.

**Args:**

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `id` | `string` | Yes | Task ID (format: `T-{uuid}`) |

**Returns:** `{ task: TaskObject | null }`

**Example:**

```typescript
task_get({ id: "T-2a200c59-1a36-4dad-a9c3-3064d180f694" })
// -> {
//   task: {
//     id: "T-2a200c59-1a36-4dad-a9c3-3064d180f694",
//     subject: "Implement user authentication",
//     description: "Add JWT-based auth to API endpoints",
//     status: "in_progress",
//     blocks: [],
//     blockedBy: ["T-abc123"],
//     owner: "morpheus",
//     threadID: "ses_xxxx"
//   }
// }
```

**ID Validation:** IDs must match the pattern `/^T-[A-Za-z0-9-]+$/`. Returns `{ error: "invalid_task_id" }` on mismatch. Returns `{ task: null }` if the file does not exist or is malformed.

---

### task_list

List all active tasks with summary information. Excludes completed and deleted tasks by default. Resolves `blockedBy` to only include unresolved (non-completed) blockers.

**Args:** None

**Returns:** `{ tasks: TaskSummary[], reminder: string }`

Each `TaskSummary`:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Task ID |
| `subject` | `string` | Task subject |
| `status` | `string` | Current status (excluding completed/deleted) |
| `owner` | `string` | Optional task owner |
| `blockedBy` | `string[]` | Unresolved blocker IDs only |

**Example:**

```typescript
task_list()
// -> {
//   tasks: [
//     { id: "T-001", subject: "Build frontend", status: "pending", blockedBy: [] },
//     { id: "T-002", subject: "Build backend", status: "in_progress", owner: "keymaker", blockedBy: [] },
//     { id: "T-003", subject: "Integration tests", status: "pending", blockedBy: ["T-001", "T-002"] }
//   ],
//   reminder: "1 task = 1 task. Maximize parallel execution by running independent tasks (tasks with empty blockedBy) concurrently."
// }
```

**Internal operations:**

1. Reads all `T-*.json` files from the task directory
2. Parses and validates each file against `TaskObjectSchema` (silently skips invalid files)
3. Filters out tasks with `status === "completed"` or `status === "deleted"`
4. For each active task, filters `blockedBy` to only include blockers whose status is NOT `"completed"`
5. Returns summaries with a parallel-execution reminder

---

### task_update

Update an existing task with new values. Supports additive dependency management via `addBlocks`/`addBlockedBy`. Merges metadata (set a key to `null` to delete it). Writes atomically and syncs.

**Args:**

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `id` | `string` | Yes | Task ID to update |
| `subject` | `string` | No | New subject |
| `description` | `string` | No | New description |
| `status` | `"pending" \| "in_progress" \| "completed" \| "deleted"` | No | New task status |
| `activeForm` | `string` | No | Present continuous form |
| `owner` | `string` | No | Task owner (agent name) |
| `addBlocks` | `string[]` | No | Task IDs to **add** to blocks (additive, not replacement) |
| `addBlockedBy` | `string[]` | No | Task IDs to **add** to blockedBy (additive, not replacement) |
| `metadata` | `Record<string, unknown>` | No | Metadata to merge (set key to `null` to delete) |

**Returns:** `{ task: TaskObject }`

**Examples:**

```typescript
// Complete a task
task_update({
  id: "T-2a200c59-1a36-4dad-a9c3-3064d180f694",
  status: "completed",
  owner: "morpheus"
})

// Add a dependency
task_update({
  id: "T-003",
  addBlockedBy: ["T-001"]
})

// Merge metadata (delete a key)
task_update({
  id: "T-001",
  metadata: { priority: null }  // removes priority from metadata
})
```

**Internal operations:**

1. Validates input against `TaskUpdateInputSchema` (Zod)
2. Validates task ID format against `/^T-[A-Za-z0-9-]+$/`
3. Acquires a file-based lock
4. Reads the existing task JSON file and validates it
5. Applies field updates:
   - Scalar fields (`subject`, `description`, `status`, `activeForm`, `owner`): direct replacement when provided
   - `addBlocks`/`addBlockedBy`: merged with existing arrays via `new Set([...existing, ...new])` — additive only
   - `metadata`: shallow merge with existing; `null` values delete the key
6. Re-validates the updated object against `TaskObjectSchema`
7. Writes atomically
8. Releases the lock
9. Syncs to the OpenCode Todo API

---

## Task Schema

```typescript
interface Task {
  id: string                    // T-{uuid}
  subject: string               // Imperative: "Run tests"
  description: string
  status: "pending" | "in_progress" | "completed" | "deleted"
  activeForm?: string           // Present continuous: "Running tests"
  blocks: string[]              // Task IDs this task blocks
  blockedBy: string[]           // Task IDs blocking this task
  owner?: string                // Agent name
  metadata?: Record<string, unknown>
  repoURL?: string
  parentID?: string             // Parent task for sub-tasks
  threadID: string              // Auto-set to session ID
}
```

Claude Code compatibility alias: `Task = TaskObject`. All field names follow Claude Code's convention (`subject`, `blockedBy`, `blocks`).

### Status Lifecycle

```
   +---------+
   | pending |
   +----+----+
        | task_update({ status: "in_progress" })
        v
   +--------------+
   | in_progress  |
   +------+-------+
          | task_update({ status: "completed" })
          v
   +-----------+
   | completed |
   +-----------+
          |
          | (or task_update({ status: "deleted" }))
          v
   +---------+
   | deleted |
   +---------+
```

### Storage Format

Tasks are stored as individual JSON files on disk:

```
~/.config/opencode/tasks/{listId}/
+-- T-2a200c59-1a36-4dad-a9c3-3064d180f694.json
+-- T-abc12345-1a36-4dad-a9c3-3064d180f694.json
+-- .lock                # Temporary lock file (auto-cleaned after 30s stale)
```

Each file is a single JSON object conforming to `TaskObjectSchema`:

```json
{
  "id": "T-2a200c59-1a36-4dad-a9c3-3064d180f694",
  "subject": "Implement user authentication",
  "description": "Add JWT-based auth to API endpoints",
  "status": "pending",
  "blocks": [],
  "blockedBy": ["T-abc12345-1a36-4dad-a9c3-3064d180f694"],
  "threadID": "ses_abc123"
}
```

### Atomic Write Protocol

All file writes use a temp-then-rename pattern to prevent partial writes:

1. Write content to `{path}.tmp.{timestamp}`
2. `renameSync(tempPath, finalPath)` — atomic on most filesystems
3. If write fails, the `.tmp` file is cleaned up

### File Locking

Concurrent write safety is provided by a file-based `.lock` mechanism:

- Lock is a JSON file `{ id: UUID, timestamp: number }` created with the `wx` flag (exclusive create)
- **30 second stale threshold**: If a lock is older than 30 seconds, it is considered abandoned and auto-released
- Lock ID is verified on release to prevent cross-process cleanup
- If the lock cannot be acquired and is not stale, the tool returns `{ error: "task_lock_unavailable" }`

---

## Todo Sync

The task system provides **bidirectional synchronization** between file-backed tasks and the OpenCode Todo API. This ensures tasks are visible in the OpenCode UI while maintaining persistent disk storage.

### Status Mapping

| Task Status | Todo Status | Behavior |
|-------------|-------------|----------|
| `pending` | `pending` | Visible in todo list |
| `in_progress` | `in_progress` | Visible in todo list |
| `completed` | `completed` | Visible in todo list |
| `deleted` | `null` | Removed from todo list |

### Sync Triggers

- `task_create`: Syncs the new task as a pending todo
- `task_update`: Syncs the updated status/fields to the corresponding todo
- `syncAllTasksToTodos()`: Bulk sync for full state reconciliation (used during session recovery)

### Sync Mechanism

The sync function `syncTaskTodoUpdate()` operates as follows:

1. Fetches current todos via `ctx.client.session.todo()`
2. Converts the task to a `TodoInfo` object via `syncTaskToTodo()`:
   - Maps status using `mapTaskStatusToTodoStatus()`
   - Extracts priority from `metadata.priority` (values: `"low"`, `"medium"`, `"high"`)
3. Filters current todos to remove the matching entry (matched by `id` first, then by `content`)
4. Pushes the updated todo (unless the task was deleted)
5. Writes the complete todo list back via a resolved `TodoWriter`

### Bulk Sync

`syncAllTasksToTodos()` handles full state reconciliation:

1. Fetches all current todos
2. Maps all tasks to todos (or `null` for deleted tasks)
3. Preserves existing non-task todos that haven't changed
4. Removes todos whose tasks were deleted
5. Writes the complete merged list back

---

## TodoWrite Disabler Hook

When the task system is enabled, the `tasks-todowrite-disabler` hook (`src/hooks/tasks-todowrite-disabler/`) acts as an **enforcement layer**.

### Behavior

| Aspect | Detail |
|--------|--------|
| **Hook type** | `tool.execute.before` — BLOCKING |
| **Trigger** | Any call to `TodoWrite` or `TodoRead` |
| **Response** | `throw new Error(...)` — blocks execution entirely |
| **Error message** | Instructs the agent to use `TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet` instead |

### Triple-Layer Enforcement

The task system enforces the transition from todos to tasks through three independent mechanisms:

| Layer | Mechanism | Location |
|-------|-----------|----------|
| 1. **Hook** | BLOCKING — throws error on TodoWrite/TodoRead | `hooks/tasks-todowrite-disabler/hook.ts` |
| 2. **Global config** | Sets `todowrite: false`, `todoread: false` | `plugin-handlers/tool-config-handler.ts` |
| 3. **Per-agent config** | Sets `todowrite: "deny"`, `todoread: "deny"` | Same, applied to 5 agents |

This triple-layer approach ensures that even if one enforcement mechanism is bypassed, the others still prevent accidental todo usage.

### Hook Error Message

When triggered, the hook returns a detailed error instructing agents to:

1. **Create** the task with `TaskCreate`
2. **Assign** themselves with `TaskUpdate({ status: "in_progress", owner: "..." })`
3. **Do the work**
4. **Complete** with `TaskUpdate({ status: "completed" })`

The message explicitly warns: "DO NOT retry TodoWrite. Convert to TaskCreate NOW" and enforces registration even for trivial tasks: "Even if the task seems trivial (1 line fix, simple edit, quick change), you MUST first register it."

---

## Agent Prompt Integration

All Matrixx agents have **dual-mode prompts**. When `useTaskSystem` is `true`, agent instructions switch from `todowrite`/`todoread` to the task tool set.

### Morpheus

The `buildTaskManagementSection(useTaskSystem)` function produces the task management section of Morpheus's prompt. When enabled:

- Uses `TaskCreate`/`TaskUpdate` workflow: Register -> Assign -> Work -> Complete
- Includes a "Why This Is Non-Negotiable" section: user visibility, drift prevention, recovery, accountability
- The hook note changes from:
  - Disabled: `"YOUR TODO CREATION WOULD BE TRACKED BY HOOK([SYSTEM REMINDER - TODO CONTINUATION])"`
  - Enabled: `"YOUR TASK CREATION WOULD BE TRACKED BY HOOK([SYSTEM REMINDER - TASK CONTINUATION])"`

Source: `src/agents/morpheus.ts`

### Keymaker

The `buildTodoDisciplineSection(useTaskSystem)` function produces the discipline section. When enabled:

- References `TaskCreate`/`TaskUpdate` instead of `todowrite`
- Same structure: triggers table, workflow, anti-patterns table
- Task creation replaces the todo creation trigger table

Source: `src/agents/keymaker.ts`

### Mouse (all 5 model variants)

The Mouse agent adapts across all supported models:

| Variant | File | Task System Behavior |
|---------|------|---------------------|
| **Claude** (default) | `default.ts` | Lists `task_create`, `task_update`, `task_list`, `task_get` as allowed tools |
| **GPT** | `gpt.ts` | Table-based blocked/allowed tools with tracking spec |
| **DeepSeek** | `deepseek.ts` | Uses shared constraint/discipline/verification utilities |
| **Mimo** | `mimo.ts` | Concise: REQUIRES `task_create`/`task_update` |
| **Qwen** | `qwen.ts` | Detailed tables: `task_create`/`task_update`/`task_list`/`task_get` allowed |

All variants share common utilities in `src/agents/mouse/shared.ts`:

- `buildConstraintsSection(useTaskSystem)`: Lists allowed tools (or mentions nothing for legacy mode)
- `buildTodoDisciplineSection(useTaskSystem)`: Task discipline vs todo discipline
- `buildVerificationTable(useTaskSystem)`: Verification section references `TaskUpdate` vs `todowrite`

---

## Dependencies and Parallel Execution

The task system enables automatic parallel execution optimization through dependency tracking.

### How It Works

```
[Build Frontend]    --+
                      +---> [Integration Tests] ---> [Deploy]
[Build Backend]     --+
```

- Tasks with **empty `blockedBy`** have no dependencies and can run in parallel
- Tasks with **non-empty `blockedBy`** wait until all blockers complete
- `task_list()` automatically filters `blockedBy` to only show **unresolved** blockers (excluding completed ones)

### Optimization Rules

1. **Start independent tasks first**: Tasks with `blockedBy: []` can begin immediately
2. **Minimize dependency chains**: Only block a task if it truly depends on another's output
3. **Short chains reduce bottlenecks**: Every dependency is a potential sequential bottleneck

### Full Example Workflow

```typescript
// Step 1: Create independent tasks (parallel-capable)
TaskCreate({ subject: "Build frontend" })                    // T-001
TaskCreate({ subject: "Build backend" })                     // T-002

// Step 2: Create dependent task
TaskCreate({ subject: "Run integration tests",
             blockedBy: ["T-001", "T-002"] })                 // T-003

// Step 3: Check state
TaskList()
// T-001 [pending] Build frontend        blockedBy: []
// T-002 [pending] Build backend         blockedBy: []
// T-003 [pending] Integration tests     blockedBy: [T-001, T-002]

// Step 4: Complete independent tasks
TaskUpdate({ id: "T-001", status: "completed" })
TaskUpdate({ id: "T-002", status: "completed" })

// Step 5: T-003 is now unblocked -- can proceed
TaskList()
// T-003 [pending] Integration tests     blockedBy: []
```

---

## Comparison: TodoWrite vs Task System

| Feature | TodoWrite | Task System |
|---------|-----------|-------------|
| Storage | Session memory (ephemeral) | File system (`~/.config/opencode/tasks/`) |
| Persistence | Lost on session close | Survives restart |
| Dependencies | None | Full `blockedBy`/`blocks` support |
| Parallel execution | Manual | Automatic optimization |
| Status tracking | pending/in_progress/completed | pending/in_progress/completed/deleted |
| Owner tracking | Not supported | Per-task owner field |
| Metadata | Not supported | Arbitrary key-value metadata |
| Parent/child | Not supported | Full `parentID` support |
| Locking | Not needed (in-memory) | File-based with 30s stale threshold |
| Todo API sync | Direct (native) | Bidirectional sync |
| Agent prompts | Todo-based instructions | Task-based instructions |
| Enforcement | None | Triple-layer: hook + global config + per-agent |

---

## When to Use

**Use the Task System when:**

- **Multi-step work**: Tasks with clear dependencies and ordering requirements
- **Multi-agent collaboration**: Multiple subagents working on related, dependent tasks
- **Session-spanning work**: Progress must persist across session restarts
- **Complex workflows**: Need dependency tracking and parallel execution analysis
- **Team visibility**: Need task ownership and status tracking across runs

**Stick with TodoWrite/TodoRead when:**

- **Simple single-step tasks**: One-off commands with no dependencies
- **Session-local tracking**: No need for persistence across restarts
- **No multi-agent coordination**: Solo work on isolated changes

---

## Note on Claude Code Alignment

This implementation follows Claude Code's internal Task tool signatures (`TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`) and field naming conventions (`subject`, `blockedBy`, `blocks`, etc.).

**However, Anthropic has not published official documentation for these tools.** The Task tools exist in Claude Code but are not documented on `docs.anthropic.com` or `code.claude.com`.

This is **Matrixx's own implementation** based on observed Claude Code behavior and internal specifications. Matrixx provides a superset of Claude Code's task capabilities, including:

- Atomic file-based storage with locking
- Bidirectional sync to the OpenCode Todo API
- Additive dependency management (`addBlocks`/`addBlockedBy`) rather than full replacement
- Metadata merge with null-key deletion
- Expanded fields (`repoURL`, `parentID`)

---

## Implementation Source Files

| File | Purpose |
|------|---------|
| `src/tools/task/task-create.ts` | `task_create` tool implementation (113 lines) |
| `src/tools/task/task-get.ts` | `task_get` tool implementation (46 lines) |
| `src/tools/task/task-list.ts` | `task_list` tool implementation (77 lines) |
| `src/tools/task/task-update.ts` | `task_update` tool implementation (151 lines) |
| `src/tools/task/todo-sync.ts` | Bidirectional Todo API sync (205 lines) |
| `src/tools/task/types.ts` | Zod schemas for all task types (77 lines) |
| `src/tools/task/constants.ts` | Task ID pattern (`/^T-[A-Za-z0-9-]+$/`) |
| `src/tools/task/index.ts` | Barrel exports |
| `src/features/task-storage/storage.ts` | Core persistence layer (169 lines) |
| `src/features/task-storage/types.ts` | Task schema and types |
| `src/features/task-storage/session-storage.ts` | Session-scoped task operations |
| `src/hooks/tasks-todowrite-disabler/hook.ts` | Blocking hook (33 lines) |
| `src/hooks/tasks-todowrite-disabler/constants.ts` | Hook error message (30 lines) |
| `src/config/schema/experimental.ts` | `task_system` config field |
| `src/config/schema/morpheus.ts` | `morpheus.tasks` config schema |
| `src/plugin/tool-registry.ts` | Conditional tool registration |
| `src/plugin-handlers/tool-config-handler.ts` | Permission denials |
| `src/plugin-handlers/agent-config-handler.ts` | `useTaskSystem` propagation |

### Key Dependencies

- **Zod v4**: Schema validation for all task inputs and storage objects
- **`@opencode-ai/plugin`**: Tool definition framework, PluginInput client
- **`node:crypto`**: `randomUUID()` for task ID generation
- **`node:fs`**: File operations (atomic writes via temp + rename)
- **`node:path`**: Path resolution for task storage directory
