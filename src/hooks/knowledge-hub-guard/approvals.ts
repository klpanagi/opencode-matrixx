import * as path from "node:path"

export const HUB_WRITE_APPROVAL_TTL_MS = 10 * 60 * 1000

const approvals = new Map<string, Map<string, number>>()

export function normalizeApprovedPath(absPath: string): string {
  return path.normalize(absPath)
}

export function approveHubWrite(sessionID: string, absPath: string, ttlMs: number = HUB_WRITE_APPROVAL_TTL_MS): string {
  const normalized = normalizeApprovedPath(absPath)
  let bySession = approvals.get(sessionID)
  if (!bySession) {
    bySession = new Map()
    approvals.set(sessionID, bySession)
  }
  bySession.set(normalized, Date.now() + ttlMs)
  return normalized
}

export function isHubWriteApproved(sessionID: string, absPath: string): boolean {
  const bySession = approvals.get(sessionID)
  if (!bySession) {
    return false
  }
  const candidate = normalizeApprovedPath(absPath)
  const now = Date.now()
  let allowed = false
  for (const [approved, expiresAt] of bySession) {
    if (expiresAt <= now) {
      bySession.delete(approved)
      continue
    }
    if (candidate === approved || candidate.startsWith(approved + path.sep)) {
      allowed = true
    }
  }
  if (bySession.size === 0) {
    approvals.delete(sessionID)
  }
  return allowed
}

export function clearHubWriteApprovals(): void {
  approvals.clear()
}
