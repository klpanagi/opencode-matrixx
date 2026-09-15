// U6 idle-parent wake scheduler (Tier-3 T2).
//
// Placement decision: a hook is the wrong home because hooks are stateless
// event interceptors — they own neither the pending/notifications maps nor
// the shutdown lifecycle. The BackgroundManager already owns completion,
// notification queues, and dispose, so the scheduler lives here as a
// per-parent timer registry over that state plus thin manager wiring.

import {
  DEFAULT_WAKE_INTERVAL_MS,
  DEFAULT_WAKE_SCHEDULER_ENABLED,
  MIN_WAKE_INTERVAL_MS,
} from "./constants"

export interface WakeSchedulerConfig {
  enabled?: boolean
  intervalMs?: number
}

export interface WakeParentState {
  hasPendingChildren: boolean
  hasUndeliveredNotifications: boolean
  hasUnfinishedTodos?: boolean
}

// Static reminder payload. Fixed string — never interpolates task prompts,
// results, or descriptions, so a compromised task output cannot inject
// instructions through the wake channel.
export const WAKE_REMINDER_TEXT = `<system-reminder>
[BACKGROUND WAKE]

One or more background tasks for this session are still running or have undelivered results.
Use background_output with the task ID to retrieve results when ready.
Do NOT poll - continue productive work.
</system-reminder>`

export function isWakeSchedulerEnabled(cfg?: WakeSchedulerConfig): boolean {
  return cfg?.enabled ?? DEFAULT_WAKE_SCHEDULER_ENABLED
}

export function resolveWakeIntervalMs(cfg?: WakeSchedulerConfig): number {
  const raw = cfg?.intervalMs ?? DEFAULT_WAKE_INTERVAL_MS
  return Math.max(MIN_WAKE_INTERVAL_MS, raw)
}

// Gating truth table — wake ONLY when work remains AND the parent is not
// explicitly idle-complete:
// | pending | undelivered | unfinishedTodos | wake |
// |---------|-------------|-----------------|------|
// | false   | false       | *               | NO   | nothing to report
// | true    | *           | false           | NO   | parent idle-complete
// | *       | true        | false           | NO   | parent idle-complete
// | true    | *           | true|undefined  | YES  |
// | *       | true        | true|undefined  | YES  |
export function shouldWakeForParent(state: WakeParentState): boolean {
  if (!state.hasPendingChildren && !state.hasUndeliveredNotifications) return false
  if (state.hasUnfinishedTodos === false) return false
  return true
}

export function nextWakeDelay(lastWakeAtMs: number, intervalMs: number, nowMs: number = Date.now()): number {
  const interval = Math.max(MIN_WAKE_INTERVAL_MS, intervalMs)
  return Math.max(0, lastWakeAtMs + interval - nowMs)
}

const MAX_STAGNANT_WAKES = 2

export class WakeTracker {
  private stagnantByParent = new Map<string, number>()

  recordWake(parentSessionID: string, progressed: boolean): boolean {
    if (progressed) {
      this.stagnantByParent.delete(parentSessionID)
      return true
    }
    const stagnant = (this.stagnantByParent.get(parentSessionID) ?? 0) + 1
    this.stagnantByParent.set(parentSessionID, stagnant)
    return stagnant <= MAX_STAGNANT_WAKES
  }

  resetOnActivity(parentSessionID: string): void {
    this.stagnantByParent.delete(parentSessionID)
  }

  stagnantCount(parentSessionID: string): number {
    return this.stagnantByParent.get(parentSessionID) ?? 0
  }
}

export type WakeTimerHandle = ReturnType<typeof setTimeout>
export type WakeScheduleTimer = (callback: () => void, delayMs: number) => WakeTimerHandle
export type WakeClearTimer = (handle: WakeTimerHandle) => void

function defaultScheduleTimer(callback: () => void, delayMs: number): WakeTimerHandle {
  return setTimeout(callback, delayMs)
}

function defaultClearTimer(handle: WakeTimerHandle): void {
  clearTimeout(handle)
}

export interface WakeRegistration {
  intervalMs: number
  readState: () => WakeParentState
  deliverWake: () => void | Promise<void>
}

export class WakeScheduler {
  private timers = new Map<string, WakeTimerHandle>()
  private registrations = new Map<string, WakeRegistration>()
  private snapshots = new Map<string, WakeParentState>()
  private readonly tracker = new WakeTracker()
  private readonly scheduleTimer: WakeScheduleTimer
  private readonly clearTimer: WakeClearTimer

  constructor(deps?: { scheduleTimer?: WakeScheduleTimer; clearTimer?: WakeClearTimer }) {
    this.scheduleTimer = deps?.scheduleTimer ?? defaultScheduleTimer
    this.clearTimer = deps?.clearTimer ?? defaultClearTimer
  }

  private armTimer(parentSessionID: string, callback: () => void, delayMs: number): void {
    const handle = this.scheduleTimer(callback, delayMs)
    // Detach the timer so wakes never keep the process alive — applies to the
    // default setTimeout and to any injected test fake alike.
    const maybeUnref = handle as unknown as { unref?: () => void }
    if (typeof maybeUnref.unref === "function") maybeUnref.unref()
    this.timers.set(parentSessionID, handle)
  }

  schedule(parentSessionID: string, registration: WakeRegistration): void {
    this.clearTimerFor(parentSessionID)
    this.registrations.set(parentSessionID, registration)
    this.snapshots.delete(parentSessionID)
    this.tracker.resetOnActivity(parentSessionID)
    this.armTimer(parentSessionID, () => void this.tick(parentSessionID), nextWakeDelay(Date.now(), registration.intervalMs))
  }

  clear(parentSessionID: string): void {
    this.clearTimerFor(parentSessionID)
    this.registrations.delete(parentSessionID)
    this.snapshots.delete(parentSessionID)
    this.tracker.resetOnActivity(parentSessionID)
  }

  dispose(): void {
    for (const handle of this.timers.values()) this.clearTimer(handle)
    this.timers.clear()
    this.registrations.clear()
    this.snapshots.clear()
  }

  hasScheduledWake(parentSessionID: string): boolean {
    return this.timers.has(parentSessionID)
  }

  private clearTimerFor(parentSessionID: string): void {
    const handle = this.timers.get(parentSessionID)
    if (handle !== undefined) {
      this.clearTimer(handle)
      this.timers.delete(parentSessionID)
    }
  }

  private async tick(parentSessionID: string): Promise<void> {
    this.timers.delete(parentSessionID)
    const registration = this.registrations.get(parentSessionID)
    if (!registration) return
    const state = registration.readState()
    const previous = this.snapshots.get(parentSessionID)
    const progressed =
      previous === undefined ||
      previous.hasPendingChildren !== state.hasPendingChildren ||
      previous.hasUndeliveredNotifications !== state.hasUndeliveredNotifications ||
      previous.hasUnfinishedTodos !== state.hasUnfinishedTodos
    this.snapshots.set(parentSessionID, state)
    if (!shouldWakeForParent(state)) {
      this.registrations.delete(parentSessionID)
      this.snapshots.delete(parentSessionID)
      return
    }
    const allowed = this.tracker.recordWake(parentSessionID, progressed)
    if (allowed) {
      try {
        await registration.deliverWake()
      } catch {
        // Best-effort wake; the next tick retries while the gate stays open.
      }
    }
    if (allowed && this.registrations.has(parentSessionID)) {
      this.armTimer(parentSessionID, () => void this.tick(parentSessionID), nextWakeDelay(Date.now(), registration.intervalMs))
    } else {
      this.registrations.delete(parentSessionID)
      this.snapshots.delete(parentSessionID)
    }
  }
}
