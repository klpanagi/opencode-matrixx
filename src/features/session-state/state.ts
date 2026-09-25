export const subagentSessions = new Set<string>()

const subagentParentMap = new Map<string, string>() // subagentID → parentID

export function registerSubagentSession(sessionID: string, parentSessionID: string): void {
  subagentSessions.add(sessionID)
  subagentParentMap.set(sessionID, parentSessionID)
}

export function unregisterSubagentSession(sessionID: string): void {
  subagentSessions.delete(sessionID)
  subagentParentMap.delete(sessionID)
}

export function getParentSessionID(subagentSessionID: string): string | undefined {
  return subagentParentMap.get(subagentSessionID)
}

/**
 * Live subagent session IDs registered under the given parent session.
 * Only sessions still present in `subagentSessions` (i.e. not yet
 * unregistered on task end) are returned.
 */
export function getSubagentSessionIDs(parentSessionID: string): string[] {
  const ids: string[] = []
  for (const subID of subagentSessions) {
    if (subagentParentMap.get(subID) === parentSessionID) ids.push(subID)
  }
  return ids
}


let _mainSessionID: string | undefined

export function setMainSession(id: string | undefined) {
  _mainSessionID = id
}

export function getMainSessionID(): string | undefined {
  return _mainSessionID
}

/**
 * Whether a session.created payload should be tracked as the plugin's main
 * session. Top-level sessions (no parentID) qualify UNLESS they are internal
 * sessions of another plugin (e.g. opencode-mem structured-output capture
 * sessions are top-level with metadata["opencode-mem"].internal === true).
 * Foreign top-level sessions must not hijack main-session tracking.
 */
export function isMainSessionCandidate(
  sessionInfo: { id?: string; parentID?: string; metadata?: Record<string, unknown> } | undefined,
): boolean {
  if (!sessionInfo || sessionInfo.parentID) return false
  const metadata = sessionInfo.metadata
  if (!metadata) return true
  // Reject sessions flagged as plugin-internal. Plugin-created top-level
  // sessions (e.g. opencode-mem capture sessions carrying
  // `opencode-mem.internal: true`) must not hijack main-session tracking.
  return !Object.entries(metadata).some(([key, value]) => {
    if (key.toLowerCase().includes("internal") && value === true) return true
    if (typeof value === "object" && value !== null && (value as { internal?: boolean }).internal === true) return true
    return false
  })
}

const sessionAgentMap = new Map<string, string>()
const sessionModelMap = new Map<string, string>()

/** @internal For testing only */
export function _resetForTesting(): void {
  _mainSessionID = undefined
  subagentSessions.clear()
  subagentParentMap.clear()
  sessionAgentMap.clear()
  sessionModelMap.clear()
}

export function setSessionAgent(sessionID: string, agent: string): void {
  if (!sessionAgentMap.has(sessionID)) {
    sessionAgentMap.set(sessionID, agent)
  }
}

export function updateSessionAgent(sessionID: string, agent: string): void {
  sessionAgentMap.set(sessionID, agent)
}

export function getSessionAgent(sessionID: string): string | undefined {
  return sessionAgentMap.get(sessionID)
}

export function clearSessionAgent(sessionID: string): void {
  sessionAgentMap.delete(sessionID)
}

export function setSessionModel(sessionID: string, model: string): void {
  sessionModelMap.set(sessionID, model)
}

export function getSessionModel(sessionID: string): string | undefined {
  return sessionModelMap.get(sessionID)
}

export function clearSessionModel(sessionID: string): void {
  sessionModelMap.delete(sessionID)
}
