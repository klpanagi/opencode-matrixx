/**
 * Wall-clock outcome helpers shared by the background agent wall-clock supervisor.
 *
 * A wall-clock timeout terminates a running task that exceeds its elapsed-time bound
 * measured from `startedAt`. This module formats the human-readable + machine-readable
 * outcome payload (mirroring saturated-outcome.ts / revive-outcome.ts).
 *
 * The status and reason are typed as `string` on purpose: this module lives in
 * `src/shared` and must not depend on `BackgroundTaskStatus` or any type from
 * `src/features/**`.
 */

export function formatWallclockTimeout(
  taskId: string,
  elapsedMs: number,
  limitMs: number,
): string {
  const metadata = JSON.stringify({
    task_id: taskId,
    status: "cancelled",
    reason: "wall-clock-timeout",
    timedOut: true,
    elapsedMs,
    limitMs,
  })

  return `Background task wall-clock timeout. Task ID ${taskId} exceeded its elapsed-time bound.

Task ID: ${taskId}
Elapsed: ${formatDuration(elapsedMs)}
Limit: ${formatDuration(limitMs)}
Status: cancelled
Reason: wall-clock-timeout

<task_metadata>${metadata}</task_metadata>`
}

/**
 * Checks whether the given status and terminal reason pair indicates a
 * wall-clock timeout. Uses raw strings so this module never imports
 * from src/features/**.
 */
export function isWallclockTimeout(
  status: string,
  terminalReason: string | undefined,
): boolean {
  return status === "cancelled" && terminalReason === "wall-clock-timeout"
}

/**
 * Formats milliseconds into a human-readable duration (e.g. "5min", "45sec").
 */
function formatDuration(ms: number): string {
  if (ms < 0) ms = 0
  if (ms >= 60_000) {
    const mins = Math.floor(ms / 60_000)
    return `${mins}min`
  }
  return `${Math.floor(ms / 1000)}sec`
}
