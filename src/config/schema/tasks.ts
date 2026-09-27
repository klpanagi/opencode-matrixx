import { z } from "zod"

/**
 * Canonical task-system configuration. Single home for everything
 * task-related: master switch, storage, enforcer behavior, poll timeout.
 *
 * Legacy locations still parse (backward compat) and act as fallback
 * with LOWER precedence — explicit `tasks.*` always wins:
 * - `morpheus.tasks.*` → `tasks.*` (same key names)
 * - `task.pollTimeoutMs` → `tasks.pollTimeoutMs`
 *
 * `experimental.task_system` and `new_task_system_enabled` are NOT listed as
 * fallbacks any more: both are deprecated no-ops since v2.7 (the legacy todo
 * system they toggled is removed) and are ignored.
 * See `resolveTasksConfig()` in `src/shared/task-system-gating.ts`.
 */
export const TasksConfigSchema = z.object({
  /** Master switch for the file-backed task system (default: true).
   * When false, task_* tools are unregistered. */
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
   * stale (default: 24). Stale tasks are excluded from task-continuation directives.
   * Fractional hours are accepted (floor 0.25 = 15 minutes): there is no separate
   * `stale_after_minutes` companion, so one key covers every window size both
   * consumers need and quarter-hour granularity is enough. */
  stale_after_hours: z.number().min(0.25).optional()
    .describe("Pending tasks with no file activity for this many hours are considered stale and excluded from task-continuation directives. Accepts fractional hours (minimum 0.25 = 15 minutes); there is no separate minutes companion key. Default 24."),
  /** Window used ONLY by the background-agent completion gates (session.idle and
   * polling): a pending/in_progress task with no file activity for this long is
   * treated as stale and stops blocking completion of its worker handle. Kept
   * separate from `stale_after_hours` because the failure costs differ — a missed
   * continuation nudge vs. a background handle held `running` past its worker. (default: 2) */
  background_stale_after_hours: z.number().min(0.25).default(2).optional()
    .describe("Window used only by the background-agent completion gates: a pending/in_progress task with no file activity for this many hours stops blocking completion of its background handle. Separate from stale_after_hours because a missed nudge and a wedged handle are different failures. Accepts fractional hours (min 0.25). Default 2."),
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
