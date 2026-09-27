import { statSync } from "node:fs"
import { join } from "node:path"
import type { MatrixxConfig } from "../../config/schema"
import type { Task } from "../../features/task-storage/types"
import { DEFAULT_BACKGROUND_STALE_AFTER_HOURS, resolveTasksConfig } from "../../shared/task-system-gating"

export const DEFAULT_STALE_AFTER_HOURS = 24

export { DEFAULT_BACKGROUND_STALE_AFTER_HOURS } from "../../shared/task-system-gating"

const HOUR_MS = 60 * 60 * 1000

/**
 * Resolve the stale threshold (ms) from plugin config.
 * `tasks.stale_after_hours` (default 24h, legacy `morpheus.tasks.stale_after_hours`) — a pending task whose
 * task file has had no write activity for longer than this is "stale".
 */
export function getStaleAfterMs(config?: Partial<MatrixxConfig>): number {
  const hours = resolveTasksConfig(config).stale_after_hours ?? DEFAULT_STALE_AFTER_HOURS
  return hours * HOUR_MS
}

/**
 * Resolve the background completion-gate threshold (ms) from plugin config.
 * `tasks.background_stale_after_hours` (default 2h, canonical only) — the same
 * mtime basis as `getStaleAfterMs`, but a much shorter window because a task
 * held `pending`/`in_progress` with no file activity is a far stronger signal
 * when it is blocking a background handle than when it is merely delaying a
 * continuation nudge. The enforcer's 24h default deliberately stays at 24.
 */
export function getBackgroundStaleAfterMs(config?: Partial<MatrixxConfig>): number {
  const hours = resolveTasksConfig(config).background_stale_after_hours ?? DEFAULT_BACKGROUND_STALE_AFTER_HOURS
  return hours * HOUR_MS
}

/**
 * Age of a task file in ms since last write (mtime). Returns null when the
 * file cannot be stat'ed (missing/unreadable) — callers treat null as "not stale".
 */
export function getTaskAgeMs(taskPath: string): number | null {
  try {
    const stat = statSync(taskPath)
    return Date.now() - stat.mtimeMs
  } catch {
    return null
  }
}

export function isTaskStale(taskPath: string, staleAfterMs: number): boolean {
  const ageMs = getTaskAgeMs(taskPath)
  return ageMs !== null && ageMs > staleAfterMs
}

/**
 * Filter incomplete tasks down to the ones that are still fresh (not stale).
 * A task whose file cannot be stat'ed is treated as fresh (not stale).
 */
export function filterFreshIncompleteTasks(tasks: Task[], taskDir: string, staleAfterMs: number): Task[] {
  return tasks.filter((t) => !isTaskStale(join(taskDir, `${t.id}.json`), staleAfterMs))
}

/** Human-readable age, e.g. "3h", "2d". */
export function formatTaskAge(ageMs: number): string {
  const hours = Math.floor(ageMs / HOUR_MS)
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days}d`
  }
  return `${hours}h`
}