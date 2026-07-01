import { log } from "../../shared/logger"

const HOOK_NAME = "consensus-state"

const disabledSessions = new Set<string>()

export function isConsensusDisabled(sessionID: string): boolean {
  return disabledSessions.has(sessionID)
}

export function disableConsensus(sessionID: string): void {
  disabledSessions.add(sessionID)
  log(`[${HOOK_NAME}] Consensus disabled for session`, { sessionID })
}

export function enableConsensus(sessionID: string): void {
  disabledSessions.delete(sessionID)
  log(`[${HOOK_NAME}] Consensus enabled for session`, { sessionID })
}

export function clearConsensusState(sessionID: string): void {
  disabledSessions.delete(sessionID)
}

/** @internal */
export function _resetConsensusStateForTesting(): void {
  disabledSessions.clear()
}
