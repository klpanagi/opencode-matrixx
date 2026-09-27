import { log, normalizeSDKResponse } from "../../shared"
import { hasPendingQuestionMessage } from "../../shared/awaiting-user"
import { RECONCILE_CONFIRMATION_GRACE_MS } from "./constants"
import type { BgHandle } from "./handle-index"
import {
  fetchSessionMessages,
  messagesHaveAssistantOutput,
  messagesHaveRecordedError,
} from "./session-output"
import type { BackgroundTerminalReason } from "./types"

export type ReconcileOutcome = {
  status: "completed" | "error" | "running" | "stopped" | "statusUncertain"
  terminalReason?: BackgroundTerminalReason
}

export interface ReconcileProbeClient {
  session: {
    status: () => Promise<unknown>
    messages: (args: { path: { id: string } }) => Promise<unknown>
    todo: (args: { path: { id: string } }) => Promise<unknown>
  }
}

export interface ReconcileDeps {
  validateOutput?: (sessionID: string) => Promise<boolean>
  sleep?: (ms: number) => Promise<void>
  /**
   * Does this session still have pending work in the file-backed task store?
   * Strictly session-scoped: an unrelated session's open task must not keep a
   * restored handle running. Optional — absent means "no pending work".
   */
  hasPendingTaskWork?: (sessionID: string) => Promise<boolean>
}

type StatusMap = Record<string, { type?: string }>

function uncertain(): ReconcileOutcome {
  return { status: "statusUncertain", terminalReason: "uncertain" }
}

function responseHasError(response: unknown): boolean {
  if (typeof response !== "object" || response === null) return false
  return Boolean((response as { error?: unknown }).error)
}

function isNonIdle(status: { type?: string } | undefined): boolean {
  return status !== undefined && status.type !== "idle"
}

async function statusesOrThrow(client: ReconcileProbeClient): Promise<StatusMap> {
  const response = await client.session.status()
  if (responseHasError(response)) throw new Error("session.status returned an error response")
  return normalizeSDKResponse(response, {} as StatusMap)
}

/**
 * Consult the injected pending-work probe. Absent probe, a rejected promise, or a
 * synchronous throw all resolve to `false` — the same fail-open direction the old
 * host todo read used, so an unreadable task store can never block completion.
 */
async function probeHasPendingTaskWork(
  deps: ReconcileDeps | undefined,
  sessionID: string,
): Promise<boolean> {
  if (!deps?.hasPendingTaskWork) return false
  try {
    return (await deps.hasPendingTaskWork(sessionID)) === true
  } catch (error) {
    log("[background-agent] Pending-work probe failed, treating as no pending work", {
      sessionID,
      error: String(error),
    })
    return false
  }
}

/**
 * Classify a persisted `running|pending` handle against the live host.
 *
 * Deterministic order: unprobeable → uncertain; non-idle → running; recorded
 * error → error; awaiting-user → running; no output → stopped; output with
 * pending task-store work in this session → running; otherwise completed.
 * Never throws.
 */
export async function reconcileHandle(
  client: ReconcileProbeClient,
  handle: BgHandle,
  deps?: ReconcileDeps,
): Promise<ReconcileOutcome> {
  const sessionID = handle.sessionID?.trim()
  if (!sessionID) return uncertain()

  try {
    const statuses = await statusesOrThrow(client)
    if (isNonIdle(statuses[sessionID])) return { status: "running" }

    const messages = await fetchSessionMessages(client, sessionID)
    if (messagesHaveRecordedError(messages)) return { status: "error" }
    if (hasPendingQuestionMessage(messages)) return { status: "running" }

    const hasOutput = deps?.validateOutput
      ? await deps.validateOutput(sessionID)
      : messagesHaveAssistantOutput(messages)

    if (!hasOutput) {
      return await confirmStopped(client, sessionID, deps)
    }

    if (await probeHasPendingTaskWork(deps, sessionID)) return { status: "running" }
    return { status: "completed" }
  } catch {
    return uncertain()
  }
}

/**
 * Optional confirmation grace: only when a `sleep` is injected do we require the
 * idle+no-output observation to persist across a second probe. Production
 * restores the fast single-probe path (no sleep supplied).
 */
async function confirmStopped(
  client: ReconcileProbeClient,
  sessionID: string,
  deps?: ReconcileDeps,
): Promise<ReconcileOutcome> {
  if (!deps?.sleep) return { status: "stopped", terminalReason: "no-output" }

  await deps.sleep(RECONCILE_CONFIRMATION_GRACE_MS)

  const statuses = await statusesOrThrow(client)
  if (isNonIdle(statuses[sessionID])) return { status: "running" }

  const messages = await fetchSessionMessages(client, sessionID)
  if (messagesHaveRecordedError(messages)) return { status: "error" }
  if (messagesHaveAssistantOutput(messages) || hasPendingQuestionMessage(messages)) {
    return { status: "running" }
  }

  return { status: "stopped", terminalReason: "no-output" }
}
