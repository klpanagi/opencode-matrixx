/**
 * Per-sessionID cache for `client.session.messages()` results.
 *
 * Why this exists: the full transcript fetch is a 5s-timeout SDK/HTTP round trip
 * that scales with SESSION LENGTH, not with the work of the tool being called.
 * Several hooks resolve the same session's agent/model on every single tool call
 * (see `isCallerOrchestrator` in src/shared/session-utils.ts and
 * `getAgentFromSession` in src/hooks/oracle-md-only/agent-resolution.ts), so the
 * same transcript was re-fetched repeatedly for the life of the session.
 *
 * We cache the RAW message list rather than each derived lookup, so both
 * `findNearestMessageWithFieldsFromSDK` and `findFirstMessageWithAgentFromSDK`
 * are served by a single fetch.
 *
 * Invalidation is TTL-based plus explicit:
 *  - TTL bounds staleness, because a new tool call CAN append a message that
 *    changes the "nearest message with an agent" answer. A session-lifetime
 *    cache would be incorrect.
 *  - `invalidateSdkMessageCache(sessionID)` lets the event hook drop a session
 *    the moment its state is known to have changed.
 */

const DEFAULT_TTL_MS = 2000

interface CacheEntry {
  messages: unknown[]
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

function now(): number {
  return Date.now()
}

/**
 * Returns the cached message list for a session, or undefined on miss/expiry.
 * Expired entries are removed eagerly so the map cannot grow unboundedly.
 */export function getCachedSdkMessages(sessionID: string): unknown[] | undefined {
  const entry = cache.get(sessionID)
  if (!entry) return undefined
  if (entry.expiresAt <= now()) {
    cache.delete(sessionID)
    return undefined
  }
  return entry.messages
}

/**
 * Stores a message list for a session. Stores a reference to the array, not a
 * clone — callers must treat cached arrays as read-only.
 */
export function setCachedSdkMessages(
  sessionID: string,
  messages: unknown[],
  ttlMs: number = DEFAULT_TTL_MS
): void {
  cache.set(sessionID, { messages, expiresAt: now() + ttlMs })
}

/** Drops the cached transcript for one session, or all sessions if omitted. */
export function invalidateSdkMessageCache(sessionID?: string): void {
  if (sessionID) {
    cache.delete(sessionID)
    return
  }
  cache.clear()
}

/** Test seam — mirrors the `_resetForTesting` convention in features/session-state. */
export function _resetSdkMessageCache(): void {
  cache.clear()
}
