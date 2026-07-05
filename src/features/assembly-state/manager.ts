import { log } from "../../shared/logger"

const HOOK_NAME = "assembly-state"

const disabledSessions = new Set<string>()

export function isAssemblyDisabled(sessionID: string): boolean {
  return disabledSessions.has(sessionID)
}

export function disableAssembly(sessionID: string): void {
  disabledSessions.add(sessionID)
  log(`[${HOOK_NAME}] Assembly disabled for session`, { sessionID })
  disabledSessions.add(sessionID)
  log(`[${HOOK_NAME}] Consensus disabled for session`, { sessionID })
}

export function enableAssembly(sessionID: string): void {
  disabledSessions.delete(sessionID)
  log(`[${HOOK_NAME}] Assembly enabled for session`, { sessionID })
  disabledSessions.delete(sessionID)
  log(`[${HOOK_NAME}] Consensus enabled for session`, { sessionID })
}

export function clearAssemblyState(sessionID: string): void {
  disabledSessions.delete(sessionID)
}

/** @internal */
export function _resetAssemblyStateForTesting(): void {
  disabledSessions.clear()
}
