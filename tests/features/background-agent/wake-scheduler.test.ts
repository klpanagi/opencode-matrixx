/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import {
  isWakeSchedulerEnabled,
  nextWakeDelay,
  resolveWakeIntervalMs,
  shouldWakeForParent,
  WAKE_REMINDER_TEXT,
  WakeScheduler,
  WakeTracker,
} from "../../../src/features/background-agent/wake-scheduler"

describe("wake-scheduler config resolution", () => {
  test("default interval is 300000", () => {
    //#given no config
    //#when resolving the interval
    const interval = resolveWakeIntervalMs(undefined)
    //#then the default is 300000
    expect(interval).toBe(300000)
  })

  test("interval floors at 60000", () => {
    //#given a config below the minimum
    //#when resolving the interval
    const interval = resolveWakeIntervalMs({ intervalMs: 1000 })
    //#then it is clamped to the 60000 floor
    expect(interval).toBe(60000)
  })

  test("scheduler is disabled by default (opt-in)", () => {
    //#given no config
    //#when checking enabled
    //#then the scheduler defaults to off (token conservation)
    expect(isWakeSchedulerEnabled(undefined)).toBe(false)
    expect(isWakeSchedulerEnabled({ enabled: false })).toBe(false)
    expect(isWakeSchedulerEnabled({ enabled: true })).toBe(true)
  })

  test("next wake delay waits a full interval", () => {
    //#given a last-wake timestamp and interval
    //#when computing the next delay
    const delay = nextWakeDelay(1000, 300000, 2000)
    //#then the delay is the remaining interval
    expect(delay).toBe(299000)
  })
})

describe("wake gating truth table", () => {
  test("no wake when nothing pending", () => {
    //#given no pending children and no undelivered notifications
    //#when evaluating the gate
    //#then no wake fires
    expect(
      shouldWakeForParent({ hasPendingChildren: false, hasUndeliveredNotifications: false }),
    ).toBe(false)
  })

  test("wake when children are pending", () => {
    //#given pending children and unfinished todos
    //#when evaluating the gate
    //#then a wake fires
    expect(
      shouldWakeForParent({ hasPendingChildren: true, hasUndeliveredNotifications: false }),
    ).toBe(true)
  })

  test("wake when notifications are undelivered", () => {
    //#given undelivered notifications and unfinished todos
    //#when evaluating the gate
    //#then a wake fires
    expect(
      shouldWakeForParent({ hasPendingChildren: false, hasUndeliveredNotifications: true }),
    ).toBe(true)
  })

  test("no wake when parent is idle-complete", () => {
    //#given remaining work but an explicit idle-complete parent
    //#when evaluating the gate
    //#then no wake fires
    expect(
      shouldWakeForParent({
        hasPendingChildren: true,
        hasUndeliveredNotifications: true,
        hasUnfinishedTodos: false,
      }),
    ).toBe(false)
  })
})

describe("WakeTracker 2-wake cap", () => {
  test("third stagnant wake suppressed", () => {
    //#given a tracker with two stagnant wakes recorded
    const tracker = new WakeTracker()
    //#when recording three consecutive non-progressed wakes
    const first = tracker.recordWake("parent", false)
    const second = tracker.recordWake("parent", false)
    const third = tracker.recordWake("parent", false)
    //#then the first two are allowed and the third is suppressed
    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(third).toBe(false)
    expect(tracker.stagnantCount("parent")).toBe(3)
  })

  test("progress resets the cap", () => {
    //#given a tracker at the stagnant cap
    const tracker = new WakeTracker()
    tracker.recordWake("parent", false)
    tracker.recordWake("parent", false)
    //#when genuine progress arrives
    const afterProgress = tracker.recordWake("parent", true)
    //#then the count resets and the next stagnant wake is allowed
    expect(afterProgress).toBe(true)
    expect(tracker.recordWake("parent", false)).toBe(true)
  })

  test("resetOnActivity clears stagnant count", () => {
    //#given a tracker with stagnant wakes
    const tracker = new WakeTracker()
    tracker.recordWake("parent", false)
    //#when activity resets the session
    tracker.resetOnActivity("parent")
    //#then the stagnant count is zero
    expect(tracker.stagnantCount("parent")).toBe(0)
  })
})

describe("WakeScheduler timer discipline", () => {
  test("schedule uses setTimeout with unref", async () => {
    //#given a scheduler with an instrumented timer
    let unrefCalls = 0
    const handles: Array<{ callback: () => void }> = []
    const scheduler = new WakeScheduler({
      scheduleTimer: (callback, _delayMs) => {
        handles.push({ callback })
        return { unref: () => { unrefCalls += 1 } } as unknown as ReturnType<typeof setTimeout>
      },
      clearTimer: () => {},
    })
    //#when scheduling a wake
    scheduler.schedule("parent", {
      intervalMs: 60000,
      readState: () => ({ hasPendingChildren: true, hasUndeliveredNotifications: false }),
      deliverWake: () => {},
    })
    //#then the timer was created and unref'd so it cannot keep the process alive
    expect(handles.length).toBe(1)
    expect(unrefCalls).toBe(1)
    expect(scheduler.hasScheduledWake("parent")).toBe(true)
    scheduler.dispose()
  })

  test("dispose clears scheduled wakes", () => {
    //#given a scheduler with cleared handles
    let cleared = 0
    const scheduler = new WakeScheduler({
      scheduleTimer: (callback, _delayMs) => {
        void callback
        return {} as unknown as ReturnType<typeof setTimeout>
      },
      clearTimer: () => { cleared += 1 },
    })
    scheduler.schedule("parent", {
      intervalMs: 60000,
      readState: () => ({ hasPendingChildren: true, hasUndeliveredNotifications: false }),
      deliverWake: () => {},
    })
    //#when disposing
    scheduler.dispose()
    //#then the timer is cleared and no wake remains scheduled
    expect(cleared).toBe(1)
    expect(scheduler.hasScheduledWake("parent")).toBe(false)
  })
})

describe("WAKE_REMINDER_TEXT", () => {
  test("static text contains system-reminder envelope", () => {
    //#given the static wake text
    //#when inspecting it
    //#then it carries the system-reminder envelope with no template slots
    expect(WAKE_REMINDER_TEXT).toContain("<system-reminder>")
    expect(WAKE_REMINDER_TEXT).toContain("</system-reminder>")
    expect(WAKE_REMINDER_TEXT).toContain("[BACKGROUND WAKE]")
    expect(WAKE_REMINDER_TEXT).not.toContain("${")
  })
})
