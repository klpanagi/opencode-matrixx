import { z } from "zod"

/**
 * Canonical task-system configuration. Single home for everything
 * task-related: master switch, storage, enforcer behavior, poll timeout.
 *
 * Legacy locations still parse (backward compat) and act as fallback
 * with LOWER precedence — explicit `tasks.*` always wins:
 * - `experimental.task_system` / `new_task_system_enabled` → `tasks.enabled`
 * - `morpheus.tasks.*` → `tasks.*` (same key names)
 * - `task.pollTimeoutMs` → `tasks.pollTimeoutMs`
 * See `resolveTasksConfig()` in `src/shared/task-system-gating.ts`.
 */
export const TasksConfigSchema = z.object({
  /** Master switch for the file-backed task system (default: true).
   * When false, task_* tools are unregistered and the legacy
   * todo-continuation-enforcer is used instead. */
  enabled: z.boolean().optional().default(true),
  /** Task storage scope: project → .matrixx/tasks per project (default),
   * global → <opencode-config>/tasks/{listId} */
  scope: z.enum(["global", "project"]).default("project").optional()
    .describe("Task storage scope: project → .matrixx/tasks per project (default), global → <opencode-config>/tasks/{listId}"),
  /** Absolute or relative storage path override. When set, bypasses scope resolution. */
  storage_path: z.string().optional(),
  /** Force task list ID (alternative to env ULTRAWORK_TASK_LIST_ID) */
  task_list_id: z.string().optional(),
  /** Pending tasks with no file activity for this many hours are considered
   * stale (default: 24). Stale tasks are excluded from task-continuation directives. */
  stale_after_hours: z.number().int().min(1).optional()
    .describe("Pending tasks with no file activity for this many hours are considered stale (default: 24). Stale tasks are excluded from task-continuation directives."),
  /** When true, the task-continuation-enforcer only considers tasks created by
   * the current session (or its subagent sessions). When false, all project
   * tasks are considered regardless of session origin. */
  session_scoped: z.boolean().default(true).optional().describe(
    "When true, the task-continuation-enforcer only considers tasks created by the current session (or its subagent sessions). When false, all project tasks are considered regardless of session origin.",
  ),
  /** Poll timeout for blocking task() calls in milliseconds (default: 600000 = 10 minutes, minimum: 60000 = 1 minute).
   * Increase this if you have complex agents (like Oracle) that delegate to sub-agents (like Seraph)
   * and the total wall time exceeds the default 10-minute budget. */
  pollTimeoutMs: z.number().min(60000).optional(),
})

export type TasksConfig = z.infer<typeof TasksConfigSchema>
