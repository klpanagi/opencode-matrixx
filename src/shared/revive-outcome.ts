/**
 * Revive-outcome helpers shared by the background task revive tools.
 *
 * A revive either produces a fresh session for a terminal task or is refused
 * with a machine-readable reason. These helpers turn either case into a
 * human-readable, non-throwing outcome for the revive tools.
 *
 * The status and reason are typed as `string` on purpose: this module lives
 * in `src/shared` and must not depend on `BackgroundTaskStatus`
 * or `ReviveBlockReason` from the background-agent feature.
 */

export const UNREVIVABLE_REASONS = ["active", "uncertain", "no-session", "unknown-task", "expired"] as const

export function isUnrevivableReason(reason: string): boolean {
  return (UNREVIVABLE_REASONS as readonly string[]).includes(reason)
}

export function formatReviveOutcome(taskId: string, sessionID: string, status: string): string {
  const metadata = JSON.stringify({
    task_id: taskId,
    session_id: sessionID,
    status,
    reason: "revived",
  })

  return `Background task revived.

Task ID: ${taskId}
Session ID: ${sessionID}
Status: ${status}

<task_metadata>${metadata}</task_metadata>`
}

export function formatUnrevivable(taskId: string, reason: string, detail?: string): string {
  const metadata = JSON.stringify({
    task_id: taskId,
    status: "unrevived",
    reason,
  })

  const detailLine = detail === undefined ? "" : `Detail: ${detail}\n`

  return `Background task NOT revived.

Task ID: ${taskId}
Reason: ${reason}
${detailLine}
<task_metadata>${metadata}</task_metadata>`
}
