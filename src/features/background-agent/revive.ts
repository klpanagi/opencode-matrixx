/**
 * Revive eligibility classification for background tasks.
 *
 * Pure logic: decides whether a persisted handle may be revived into a new
 * session. No I/O, no manager access, no client imports.
 */

import type { BgHandle } from "./handle-index"
import type { BackgroundTask } from "./types"

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

/**
 * Locate a revivable handle by task id or session id. `taskId` wins when
 * both are supplied. Returns `undefined` when neither matches.
 */
export function findRevivableHandle(
  handles: BgHandle[],
  opts: { taskId?: string; sessionId?: string },
): BgHandle | undefined {
  if (opts.taskId !== undefined && opts.taskId !== "") {
    const byTask = handles.find((handle) => handle.taskId === opts.taskId)
    if (byTask) return byTask
  }
  if (opts.sessionId !== undefined && opts.sessionId !== "") {
    return handles.find((handle) => handle.sessionID === opts.sessionId)
  }
  return undefined
}

/**
 * Rehydrate a pre-admission `BackgroundTask` from a persisted handle with a
 * NEW prompt. Mirrors `restoreTaskFromHandle` except `prompt` comes from the
 * caller and `status` restarts at `"pending"`; `startedAt` is left unset (it
 * is assigned on admission) and `completedAt`/`error` are cleared.
 */
export function toReviveTask(handle: BgHandle, prompt: string): BackgroundTask {
  return {
    id: handle.taskId,
    parentSessionID: handle.parentSessionID,
    parentMessageID: handle.parentMessageID,
    description: handle.description,
    prompt,
    agent: handle.agent,
    status: "pending",
    sessionID: handle.sessionID,
    queuedAt: handle.queuedAt !== undefined ? new Date(handle.queuedAt) : undefined,
    completedAt: undefined,
    error: undefined,
    model: handle.model,
    category: handle.category,
    concurrencyGroup: handle.concurrencyGroup,
  }
}
