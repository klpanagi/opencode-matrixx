/**
 * Wall-clock supervisor: fire-once elapsed-time bound for running background tasks.
 *
 * Staleness is activity-based; this module is elapsed-time-based. Each armed entry
 * fires its callback exactly once when `startedAtMs + timeoutMs` passes, no matter
 * how busy or productive the task looks. A timeout of `0` or `undefined` means OFF
 * and arms nothing.
 *
 * Grace contract (manager-owned, pinned here): on fire the manager aborts the
 * session once, waits `wallClockAbortGraceMs`, then marks the task terminal —
 * unless the task completed naturally during grace, in which case the natural
 * outcome wins and the pending mark is cancelled.
 *
 * This module must not import from manager/client/fs — pure timers only. It mirrors
 * the settled-flag lifecycle of `acquireWithDeadline` in `concurrency.ts`.
 */

/** Maximum delay accepted by `setTimeout` (2^31-1 ms); enforced by schema max too. */
export const MAX_WALLCLOCK_TIMEOUT_MS = 2_147_483_647

/** Context delivered to the fire callback exactly once per armed deadline. */
export interface WallclockFireContext {
  taskId: string
  elapsedMs: number
  limitMs: number
}

export type WallclockFireCallback = (ctx: WallclockFireContext) => void

interface WallclockEntry {
  deadlineAt: number
  fired: boolean
  timer: ReturnType<typeof setTimeout> | undefined
}

/** Pure remaining-time math: deadline minus now (negative when already expired). */
export function remainingMs(startedAtMs: number, timeoutMs: number, nowMs: number = Date.now()): number {
  return startedAtMs + timeoutMs - nowMs
}

/** OFF (`0`/`undefined`) never arms; any other value is an active elapsed-time bound. */
export function isWallclockEnabled(timeoutMs: number | undefined): timeoutMs is number {
  return timeoutMs !== undefined && timeoutMs !== 0
}

export class WallclockSupervisor {
  private entries: Map<string, WallclockEntry> = new Map()

  arm(taskId: string, startedAtMs: number, timeoutMs: number | undefined, onFire: WallclockFireCallback): void {
    if (!isWallclockEnabled(timeoutMs)) return
    const limitMs = Math.min(timeoutMs, MAX_WALLCLOCK_TIMEOUT_MS)
    this.disarm(taskId)
    const deadlineAt = startedAtMs + limitMs
    const delayMs = Math.max(deadlineAt - Date.now(), 0)
    let timer: ReturnType<typeof setTimeout> | undefined
    const entry: WallclockEntry = { deadlineAt, fired: false, timer }
    timer = setTimeout(() => {
      if (entry.fired) return
      entry.fired = true
      this.entries.delete(taskId)
      onFire({ taskId, elapsedMs: Date.now() - startedAtMs, limitMs })
    }, delayMs)
    entry.timer = timer
    this.entries.set(taskId, entry)
  }

  disarm(taskId: string): boolean {
    const entry = this.entries.get(taskId)
    if (entry === undefined) return false
    entry.fired = true
    if (entry.timer !== undefined) clearTimeout(entry.timer)
    this.entries.delete(taskId)
    return true
  }

  disarmAll(): void {
    for (const entry of this.entries.values()) {
      entry.fired = true
      if (entry.timer !== undefined) clearTimeout(entry.timer)
    }
    this.entries.clear()
  }

  size(): number {
    return this.entries.size
  }

  getDeadlineAt(taskId: string): number | undefined {
    return this.entries.get(taskId)?.deadlineAt
  }
}
