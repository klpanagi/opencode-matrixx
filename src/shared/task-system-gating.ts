import type { MatrixxConfig } from "../config/schema"
import type { TasksConfig } from "../config/schema/tasks"

export const TASK_SYSTEM_DEFAULT = true as const

export type ResolvedTasksConfig = Required<
  Pick<TasksConfig, "enabled" | "scope" | "session_scoped">
> &
  Pick<
    TasksConfig,
    "storage_path" | "task_list_id" | "stale_after_hours" | "pollTimeoutMs"
  >

/**
 * Merge the canonical `tasks` section with legacy locations.
 * Explicit `tasks.*` always wins; legacy keys fill the gaps:
 * `experimental.task_system` / `new_task_system_enabled` → enabled,
 * `morpheus.tasks.*` → same-named key, `task.pollTimeoutMs` → pollTimeoutMs.
 * Pure derivation, no mutation — safe to call on every read.
 */
export function resolveTasksConfig(
  config: Partial<MatrixxConfig> | undefined | null,
): ResolvedTasksConfig {
  const canonical = config?.tasks
  const legacyTasks = config?.morpheus?.tasks
  const legacyPoll = config?.task?.pollTimeoutMs
  return {
    enabled:
      canonical?.enabled ??
      config?.experimental?.task_system ??
      config?.new_task_system_enabled ??
      TASK_SYSTEM_DEFAULT,
    scope: canonical?.scope ?? legacyTasks?.scope ?? "project",
    storage_path: canonical?.storage_path ?? legacyTasks?.storage_path,
    task_list_id: canonical?.task_list_id ?? legacyTasks?.task_list_id,
    stale_after_hours:
      canonical?.stale_after_hours ?? legacyTasks?.stale_after_hours,
    session_scoped:
      canonical?.session_scoped ?? legacyTasks?.session_scoped ?? true,
    pollTimeoutMs: canonical?.pollTimeoutMs ?? legacyPoll,
  }
}

export function isTaskSystemEnabled(
  config: Partial<MatrixxConfig> | undefined | null,
): boolean {
  return resolveTasksConfig(config).enabled
}
