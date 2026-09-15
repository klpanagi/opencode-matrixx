/// <reference types="bun-types" />
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { BackgroundTask } from "../../../src/features/background-agent/types"
import { BackgroundManager } from "../../../src/features/background-agent/manager"
import { BgHandleSchema } from "../../../src/features/background-agent/handle-index"
import { classifyRevivable } from "../../../src/features/background-agent/revive"

/**
 * U7 Wave-3 T5 — negative-path hardening for the wall-clock supervisor.
 *
 * Zero `manager.ts` churn: every invariant below pins existing T3 wiring
 * (fire-once guard, `if (task.concurrencyKey)` release guard, grace
 * disarm, OFF-default, Tier-2 `classifyRevivable`, strict `BgHandleSchema`).
 * If a future change breaks one of these tests, the fix budget is ≤30 lines
 * mirroring the stale ordering — document the site here.
 *
 * Suites: (a) deny/no-leak, (b) no-phantom-release, (c) one-shot,
 * (d) busy-killed, (e) OFF-default passthrough, (f) grace-wins,
 * (g) revive-after-wallclock, (h) strict-schema compat.
 */

let TMP_DIR = ""

interface AbortCall {
  id: string
}

function makeClient() {
  const abortCalls: AbortCall[] = []
  const promptCalls: Array<{ path: { id: string }; body: { parts?: Array<{ type: string; text: string }> } }> = []
  const client = {
    session: {
      get: async () => ({ data: { directory: TMP_DIR } }),
      create: async () => ({ data: { id: "sess_new" } }),
      promptAsync: async (args: { path: { id: string }; body: { parts?: Array<{ type: string; text: string }> } }) => {
        promptCalls.push(args)
        return {}
      },
      abort: async (args: { path: { id: string } }) => {
        abortCalls.push({ id: args.path.id })
        return {}
      },
      messages: async () => ({ data: [] }),
      todo: async () => ({ data: [] }),
      status: async () => ({}),
    },
  }
  return { client, abortCalls, promptCalls }
}

function makeManager(client: unknown, dir: string, config?: unknown): BackgroundManager {
  return new BackgroundManager({ client, directory: dir } as never, config as never)
}

function seedRunningTask(mgr: BackgroundManager, id: string, overrides?: Partial<BackgroundTask>): BackgroundTask {
  const task: BackgroundTask = {
    id,
    status: "running",
    sessionID: `sess_${id}`,
    parentSessionID: "sess_parent01",
    parentMessageID: "msg_parent01",
    description: "wallclock hardening task",
    prompt: "do work",
    agent: "oracle",
    queuedAt: new Date(Date.now() - 60_000),
    startedAt: new Date(),
    ...overrides,
  }
  ;(mgr as unknown as { tasks: Map<string, BackgroundTask> }).tasks.set(task.id, task)
  return task
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fireOf(mgr: BackgroundManager): (id: string) => Promise<void> {
  return (mgr as unknown as { onWallclockFire: (id: string) => Promise<void> }).onWallclockFire.bind(mgr)
}

function wallclockSize(mgr: BackgroundManager): number {
  return (mgr as unknown as { wallclock: { size: () => number } }).wallclock.size()
}

describe("BackgroundManager wallclock hardening (T5)", () => {
  beforeEach(() => {
    TMP_DIR = mkdtempSync(join(tmpdir(), "wallclock-hardening-"))
  })

  afterEach(() => {
    try {
      rmSync(TMP_DIR, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  })

  test("(a) deny/no-leak — fire on a slotless task leaves getCount unchanged and a later admission still grants", async () => {
    //#given a task whose admission never held a slot (no concurrencyKey, baseline count 0)
    const { client } = makeClient()
    const mgr = makeManager(client, TMP_DIR, { wallClockTimeoutMs: 60000, wallClockAbortGraceMs: 20 })
    const concurrency = (
      mgr as unknown as { concurrencyManager: { acquire: (k: string) => Promise<void>; getCount: (k: string) => number } }
    ).concurrencyManager
    expect(concurrency.getCount("oracle")).toBe(0)
    const task = seedRunningTask(mgr, "bg_hard_noleak")
    const fire = fireOf(mgr)

    //#when the wall-clock fires and the grace elapses
    await fire(task.id)
    await sleep(150)

    //#then no slot was leaked and a subsequent admission still grants
    expect(concurrency.getCount("oracle")).toBe(0)
    expect(mgr.getTask(task.id)?.status).toBe("cancelled")
    expect(mgr.getTask(task.id)?.terminalReason).toBe("wall-clock-timeout")
    await concurrency.acquire("oracle")
    expect(concurrency.getCount("oracle")).toBe(1)
    mgr.shutdown()
  })

  test("(b) no-phantom-release — fire on a bypass-admitted task does not decrement below baseline", async () => {
    //#given one held slot plus a bypass-admitted task (group set, key unset — never acquired)
    const { client } = makeClient()
    const mgr = makeManager(client, TMP_DIR, { wallClockTimeoutMs: 60000, wallClockAbortGraceMs: 20 })
    const concurrency = (
      mgr as unknown as { concurrencyManager: { acquire: (k: string) => Promise<void>; getCount: (k: string) => number } }
    ).concurrencyManager
    await concurrency.acquire("oracle")
    expect(concurrency.getCount("oracle")).toBe(1)
    const task = seedRunningTask(mgr, "bg_hard_phantom", { concurrencyGroup: "oracle", concurrencyKey: undefined })
    const fire = fireOf(mgr)

    //#when the wall-clock fires and the grace elapses
    await fire(task.id)
    await sleep(150)

    //#then the held slot is untouched — no phantom release
    expect(mgr.getTask(task.id)?.status).toBe("cancelled")
    expect(mgr.getTask(task.id)?.concurrencyKey).toBeUndefined()
    expect(concurrency.getCount("oracle")).toBe(1)
    mgr.shutdown()
  })

  test("(c) one-shot — double onWallclockFire yields a single abort, single release, single notify", async () => {
    //#given a running task holding a slot
    const { client, abortCalls, promptCalls } = makeClient()
    const mgr = makeManager(client, TMP_DIR, { wallClockTimeoutMs: 60000, wallClockAbortGraceMs: 20 })
    const concurrency = (
      mgr as unknown as { concurrencyManager: { acquire: (k: string) => Promise<void>; getCount: (k: string) => number } }
    ).concurrencyManager
    await concurrency.acquire("oracle")
    const task = seedRunningTask(mgr, "bg_hard_oneshot", { concurrencyKey: "oracle", concurrencyGroup: "oracle" })
    const fire = fireOf(mgr)

    //#when the fire callback is invoked twice before the grace elapses
    await fire(task.id)
    await fire(task.id)
    await sleep(150)

    //#then exactly one abort, one release, one parent notification
    expect(abortCalls.length).toBe(1)
    expect(abortCalls[0].id).toBe(task.sessionID)
    expect(promptCalls.length).toBe(1)
    expect(concurrency.getCount("oracle")).toBe(0)
    expect(mgr.getTask(task.id)?.concurrencyKey).toBeUndefined()
    expect(mgr.getTask(task.id)?.terminalReason).toBe("wall-clock-timeout")
    mgr.shutdown()
  })

  test("(d) busy-killed — a non-idle progressing task still fires on elapsed expiry", async () => {
    //#given a running task that looks busy and productive (recent progress, message growth)
    const { client, abortCalls } = makeClient()
    const mgr = makeManager(client, TMP_DIR, { wallClockTimeoutMs: 60000, wallClockAbortGraceMs: 20 })
    const task = seedRunningTask(mgr, "bg_hard_busy", {
      progress: { toolCalls: 42, lastUpdate: new Date() },
      lastMsgCount: 128,
      stablePolls: 0,
    })
    const fire = fireOf(mgr)

    //#when the elapsed bound fires despite the activity
    await fire(task.id)
    await sleep(150)

    //#then the task is bounded anyway — the U7 gap closure over activity-based staleness
    expect(abortCalls.length).toBe(1)
    expect(mgr.getTask(task.id)?.status).toBe("cancelled")
    expect(mgr.getTask(task.id)?.terminalReason).toBe("wall-clock-timeout")
    expect(mgr.getTask(task.id)?.error).toContain("Wall-clock timeout")
    mgr.shutdown()
  })

  test("(e) OFF-default — no config never arms across start/resume/revive-style re-arms", async () => {
    //#given two managers with wall-clock OFF (absent config and explicit 0)
    const { client } = makeClient()
    const mgrDefault = makeManager(client, TMP_DIR, {})
    const mgrZero = makeManager(client, TMP_DIR, { wallClockTimeoutMs: 0 })
    const taskDefault = seedRunningTask(mgrDefault, "bg_hard_off_default")
    const taskZero = seedRunningTask(mgrZero, "bg_hard_off_zero")

    //#when arming as start, resume, and revive all do (fresh startedAt each time)
    const armDefault = mgrDefault as unknown as { armWallclock: (t: BackgroundTask) => void }
    const armZero = mgrZero as unknown as { armWallclock: (t: BackgroundTask) => void }
    armDefault.armWallclock(taskDefault)
    armZero.armWallclock(taskZero)
    taskDefault.startedAt = new Date()
    taskZero.startedAt = new Date()
    armDefault.armWallclock(taskDefault)
    armZero.armWallclock(taskZero)
    taskDefault.startedAt = new Date()
    armDefault.armWallclock(taskDefault)

    //#then nothing is ever armed and shutdown stays clean
    expect(wallclockSize(mgrDefault)).toBe(0)
    expect(wallclockSize(mgrZero)).toBe(0)
    expect(mgrDefault.getTask(taskDefault.id)?.status).toBe("running")
    expect(mgrZero.getTask(taskZero.id)?.status).toBe("running")
    mgrDefault.shutdown()
    mgrZero.shutdown()
    expect(wallclockSize(mgrDefault)).toBe(0)
    expect(wallclockSize(mgrZero)).toBe(0)
  })

  test("(f) grace-wins — natural completion during grace cancels the mark and a late fire is a no-op", async () => {
    //#given a running task whose wall-clock has fired but whose grace has not elapsed
    const { client, abortCalls } = makeClient()
    const mgr = makeManager(client, TMP_DIR, { wallClockTimeoutMs: 60000, wallClockAbortGraceMs: 30 })
    const task = seedRunningTask(mgr, "bg_hard_grace")
    const fire = fireOf(mgr)

    //#when the task completes naturally during grace and the timer is disarmed
    await fire(task.id)
    task.status = "completed"
    task.completedAt = new Date()
    ;(mgr as unknown as { disarmWallclock: (id: string) => void }).disarmWallclock(task.id)
    await sleep(150)
    await fire(task.id)

    //#then the natural outcome wins and the pending mark is cancelled
    expect(abortCalls.length).toBe(1)
    const current = mgr.getTask(task.id)
    expect(current?.status).toBe("completed")
    expect(current?.terminalReason).toBeUndefined()
    expect(current?.error).toBeUndefined()
    mgr.shutdown()
  })

  test("(g) revive-after-wallclock — cancelled/wall-clock-timeout with sessionID is revivable, without is no-session", async () => {
    //#given a wall-clock-cancelled handle with a session and one without
    const withSession = { status: "cancelled", sessionID: "sess_wallclock01", terminalReason: "wall-clock-timeout" }
    const withoutSession = { status: "cancelled", sessionID: undefined, terminalReason: "wall-clock-timeout" }
    const emptySession = { status: "cancelled", sessionID: "   ", terminalReason: "wall-clock-timeout" }

    //#when classifying through the Tier-2 classifier
    const eligible = classifyRevivable(withSession, {})
    const blocked = classifyRevivable(withoutSession, {})
    const blockedEmpty = classifyRevivable(emptySession, {})

    //#then session-bearing handles revive, sessionless handles report no-session
    expect(eligible).toEqual({ eligible: true })
    expect(blocked).toEqual({ eligible: false, reason: "no-session" })
    expect(blockedEmpty).toEqual({ eligible: false, reason: "no-session" })
  })

  test("(h) strict-schema compat — old handles parse, wall-clock-timeout parses, unknown reasons and keys rejected", async () => {
    //#given legacy, new, rejected-reason, and rogue-key payloads
    const base = {
      taskId: "bg_compat01",
      parentSessionID: "sess_parent",
      parentMessageID: "msg_parent",
      description: "compat probe",
      agent: "oracle",
    }
    const legacy = { ...base, status: "cancelled" }
    const wallclock = { ...base, status: "cancelled", sessionID: "sess_child", terminalReason: "wall-clock-timeout" }
    const unknownReason = { ...base, status: "cancelled", terminalReason: "megadeath" }
    const rogueKey = { ...base, status: "running", rogueKey: "must be rejected" }

    //#when parsing against the strict schema
    const legacyResult = BgHandleSchema.safeParse(legacy)
    const wallclockResult = BgHandleSchema.safeParse(wallclock)
    const unknownResult = BgHandleSchema.safeParse(unknownReason)
    const rogueResult = BgHandleSchema.safeParse(rogueKey)

    //#then old and new parse, unknown reasons and keys are rejected
    expect(legacyResult.success).toBe(true)
    expect(wallclockResult.success).toBe(true)
    if (wallclockResult.success) {
      expect(wallclockResult.data.terminalReason).toBe("wall-clock-timeout")
      expect(wallclockResult.data.sessionID).toBe("sess_child")
    }
    expect(unknownResult.success).toBe(false)
    expect(rogueResult.success).toBe(false)
  })
})
