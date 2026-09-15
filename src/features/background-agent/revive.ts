/**
 * Revive eligibility classification for background tasks.
 *
 * Pure logic: decides whether a persisted handle may be revived into a new
 * session. No I/O, no manager access, no client imports.
 */

export const REVIVABLE_STATUSES = ["cancelled", "stopped", "interrupt", "error", "completed"] as const

export function isRevivableStatus(status: string): boolean {
  return (REVIVABLE_STATUSES as readonly string[]).includes(status)
}

export type ReviveBlockReason = "active" | "uncertain" | "no-session" | "unknown-task" | "expired"

export type ReviveEligibility = { eligible: true } | { eligible: false; reason: ReviveBlockReason }

// "expired" is never returned by this function — it is synthesized by the tool layer from an on-disk handle miss.
export function classifyRevivable(
  handle: { status: string; sessionID?: string; terminalReason?: string },
  opts?: { force?: boolean },
): ReviveEligibility {
  if (handle.status === "pending" || handle.status === "running") {
    return { eligible: false, reason: "active" }
  }
  if (handle.sessionID === undefined || handle.sessionID.trim().length === 0) {
    return { eligible: false, reason: "no-session" }
  }
  if (handle.status === "statusUncertain") {
    if (opts?.force === true) {
      return { eligible: true }
    }
    return { eligible: false, reason: "uncertain" }
  }
  if (isRevivableStatus(handle.status)) {
    return { eligible: true }
  }
  return { eligible: false, reason: "unknown-task" }
}
