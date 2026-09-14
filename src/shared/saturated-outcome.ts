/**
 * Launch-outcome helpers shared by the background task launch tools.
 *
 * A launch can terminate without ever producing a session. T7 made a saturated
 * queue admission produce a terminal `stopped` task with
 * `terminalReason: "queue-saturated"` (nested depth-exceeded produces
 * `terminalReason: "nested-depth-exceeded"`). These helpers turn that terminal
 * state into a machine-readable, non-throwing outcome for the launch tools.
 *
 * The status is typed as `string` on purpose: this module must not import from
 * `src/features/**`, so it cannot depend on `BackgroundTaskStatus`.
 */

export const LAUNCH_TERMINAL_STATUSES = [
  "error",
  "cancelled",
  "interrupt",
  "stopped",
  "statusUncertain",
] as const

export type LaunchTerminalStatus = (typeof LAUNCH_TERMINAL_STATUSES)[number]

export function isLaunchTerminalStatus(status: string): status is LaunchTerminalStatus {
  return (LAUNCH_TERMINAL_STATUSES as readonly string[]).includes(status)
}

export function isQueueSaturated(status: string, terminalReason: string | undefined): boolean {
  return status === "stopped" && terminalReason === "queue-saturated"
}

export function formatSaturatedOutcome(taskId: string): string {
  const metadata = JSON.stringify({
    task_id: taskId,
    status: "stopped",
    reason: "queue-saturated",
  })

  return `Background task NOT admitted (queue saturated).

Task ID: ${taskId}
Status: stopped
Reason: queue-saturated

<task_metadata>${metadata}</task_metadata>`
}

export function formatLaunchFailure(taskId: string, status: string): string {
  return `Task failed to start (status: ${status}).\n\nTask ID: ${taskId}`
}
