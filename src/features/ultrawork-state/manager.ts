import { log } from "../../shared/logger"

const HOOK_NAME = "ultrawork-state"

const sessionStates = new Map<string, "enabled" | "disabled">()

export function getUltraworkState(
  sessionID: string,
): "enabled" | "disabled" | undefined {
  return sessionStates.get(sessionID)
}

export function enableUltrawork(sessionID: string): void {
  sessionStates.set(sessionID, "enabled")
  log(`[${HOOK_NAME}] Ultrawork enabled for session`, { sessionID })
}

export function disableUltrawork(sessionID: string): void {
  sessionStates.set(sessionID, "disabled")
  log(`[${HOOK_NAME}] Ultrawork disabled for session`, { sessionID })
}

export function clearUltraworkState(sessionID: string): void {
  sessionStates.delete(sessionID)
}

/** @internal */
export function _resetUltraworkStateForTesting(): void {
  sessionStates.clear()
}
