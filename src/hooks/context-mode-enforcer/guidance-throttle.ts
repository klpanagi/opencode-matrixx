import { closeSync, constants as fsConstants, mkdirSync, openSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

/**
 * Once-per-session guidance throttle (port of upstream `routing.mjs`
 * `guidanceOnce`, lines 36-144).
 *
 * Each advisory type fires at most once per session. Two layers:
 *   - In-memory `Set` for the same process (OpenCode plugin host).
 *   - `O_EXCL` file markers for cross-process atomicity, so a second process
 *     handling the same logical session cannot re-emit the advisory.
 *
 * Session identity is the caller-supplied `sessionID` (stable across hook
 * invocations), falling back to `process.ppid` when it is absent or
 * sanitizes to nothing. The id is sanitized before it reaches the filesystem:
 * an untrusted session id must never escape the marker directory.
 *
 * Failure policy: fail OPEN. Any filesystem error other than `EEXIST` returns
 * `true` (show the guidance) — losing a marker is preferable to silently
 * dropping an advisory. This function never throws and never mutates caller
 * state beyond its own bookkeeping.
 */

/** Max length of the sanitized session id used in the marker directory name. */
const MAX_SESSION_ID_LENGTH = 128

const UNSAFE_PATH_CHARS = /[^A-Za-z0-9_-]/g

/** sessionID-or-ppid :: type */
const shown = new Set<string>()

function sanitizeSessionID(sessionID: string | undefined): string {
  const sanitized = (sessionID ?? "").replace(UNSAFE_PATH_CHARS, "").slice(0, MAX_SESSION_ID_LENGTH)
  return sanitized || String(process.ppid)
}

function markerDirFor(sessionID: string | undefined): string {
  return resolve(tmpdir(), `matrixx-ctx-guidance-s-${sanitizeSessionID(sessionID)}`)
}

function isAlreadyMarked(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | null)?.code === "EEXIST"
}

/**
 * Returns `true` at most once per (session, type); every later call for the
 * same pair returns `false`.
 */
export function shouldShowGuidance(sessionID: string | undefined, type: string): boolean {
  const key = `${sanitizeSessionID(sessionID)}::${type}`

  // Fast path: already shown in this process.
  if (shown.has(key)) return false

  const dir = markerDirFor(sessionID)
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // The marker directory is unusable (e.g. a plain file sits at that path).
    // Fail open below rather than silently dropping the advisory.
    shown.add(key)
    return true
  }

  try {
    // Atomic create-or-fail: first writer wins, everyone else gets EEXIST.
    const fd = openSync(resolve(dir, type), fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY)
    closeSync(fd)
    shown.add(key)
    return true
  } catch (err) {
    // EEXIST = another process already created it; anything else means the
    // marker could not be written at all. In-memory throttling applies either
    // way, so the pair never fires twice in this process.
    shown.add(key)
    return !isAlreadyMarked(err)
  }
}

/** Test-only: clear the in-memory layer. File markers are left untouched. */
export function _resetGuidanceThrottleForTesting(): void {
  shown.clear()
}
