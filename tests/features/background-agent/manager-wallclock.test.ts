/// <reference types="bun-types" />
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { BackgroundTask } from "../../../src/features/background-agent/types"
import { BackgroundManager } from "../../../src/features/background-agent/manager"

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

function seedRunningTask(mgr: BackgroundManager, overrides?: Partial<BackgroundTask>): BackgroundTask {
  const task: BackgroundTask = {
    id: "bg_wallclock01",
    status: "running",
    sessionID: "sess_wallclock01",
    parentSessionID: "sess_parent01",
    parentMessageID: "msg_parent01",
    description: "wallclock task",
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

describe("BackgroundManager wallclock wiring", () => {
  beforeEach(() => {
    TMP_DIR = mkdtempSync(join(tmpdir(), "manager-wallclock-"))
  })

  afterEach(() => {
    try {
      rmSync(TMP_DIR, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  })

  test("OFF (0/undefined) arms nothing", async () => {
    //#given
    const { client } = makeClient()
    const mgr = makeManager(client, TMP_DIR, {})
    const task = seedRunningTask(mgr)

    //#when
    ;(mgr as unknown as { armWallclock: (t: BackgroundTask) => void }).armWallclock(task)

    //#then
    const supervisor = mgr as unknown as { wallclock: { size: () => number } }
    expect(supervisor.wallclock.size()).toBe(0)
    mgr.shutdown()
  })

  test("fires once with wall-clock-timeout context", async () => {
    //#given
    const { client, abortCalls, promptCalls } = makeClient()
    const mgr = makeManager(client, TMP_DIR, { wallClockTimeoutMs: 60000, wallClockAbortGraceMs: 20 })
    await (mgr as unknown as { concurrencyManager: { acquire: (k: string) => Promise<void> } }).concurrencyManager.acquire("oracle")
    const task = seedRunningTask(mgr, { concurrencyKey: "oracle", concurrencyGroup: "oracle" })
    const sibling = seedRunningTask(mgr, { id: "bg_wallclock02", sessionID: "sess_wallclock02" })
    ;(mgr as unknown as { pendingByParent: Map<string, Set<string>> }).pendingByParent.set(
      task.parentSessionID,
      new Set([task.id, sibling.id]),
    )
    const fire = (mgr as unknown as { onWallclockFire: (id: string) => Promise<void> }).onWallclockFire.bind(mgr)

    //#when
    await fire(task.id)
    await fire(task.id)
    await sleep(100)

    //#then
    expect(abortCalls.length).toBe(1)
    expect(abortCalls[0].id).toBe(task.sessionID)
    const current = mgr.getTask(task.id)
    expect(current?.status).toBe("cancelled")
    expect(current?.terminalReason).toBe("wall-clock-timeout")
    expect(current?.error).toContain("Wall-clock timeout")
    expect(current?.completedAt).toBeDefined()
    expect(promptCalls.length).toBe(1)
    expect(promptCalls[0].body.parts?.[0]?.type).toBe("text")
    expect(promptCalls[0].body.parts?.[0]?.text).toContain("wall-clock-timeout")
    mgr.shutdown()
  })

  test("slot released exactly once", async () => {
    //#given
    const { client, abortCalls } = makeClient()
    const mgr = makeManager(client, TMP_DIR, { wallClockTimeoutMs: 60000, wallClockAbortGraceMs: 20 })
    const concurrency = (mgr as unknown as { concurrencyManager: { acquire: (k: string) => Promise<void>; getCount: (k: string) => number } }).concurrencyManager
    await concurrency.acquire("oracle")
    expect(concurrency.getCount("oracle")).toBe(1)
    const task = seedRunningTask(mgr, { concurrencyKey: "oracle", concurrencyGroup: "oracle" })
    const fire = (mgr as unknown as { onWallclockFire: (id: string) => Promise<void> }).onWallclockFire.bind(mgr)

    //#when
    await fire(task.id)
    await fire(task.id)
    await sleep(100)

    //#then
    expect(abortCalls.length).toBe(1)
    expect(concurrency.getCount("oracle")).toBe(0)
    expect(mgr.getTask(task.id)?.concurrencyKey).toBeUndefined()
    mgr.shutdown()
  })

  test("grace lets natural completion win", async () => {
    //#given
    const { client, abortCalls } = makeClient()
    const mgr = makeManager(client, TMP_DIR, { wallClockTimeoutMs: 60000, wallClockAbortGraceMs: 30 })
    const task = seedRunningTask(mgr)
    const fire = (mgr as unknown as { onWallclockFire: (id: string) => Promise<void> }).onWallclockFire.bind(mgr)

    //#when
    await fire(task.id)
    task.status = "completed"
    task.completedAt = new Date()
    ;(mgr as unknown as { disarmWallclock: (id: string) => void }).disarmWallclock(task.id)
    await sleep(100)

    //#then
    expect(abortCalls.length).toBe(1)
    const current = mgr.getTask(task.id)
    expect(current?.status).toBe("completed")
    expect(current?.terminalReason).toBeUndefined()
    expect(current?.error).toBeUndefined()
    mgr.shutdown()
  })

  test("enabled arms with remaining time and does not fire early", async () => {
    //#given
    const { client, abortCalls } = makeClient()
    const mgr = makeManager(client, TMP_DIR, { wallClockTimeoutMs: 60000, wallClockAbortGraceMs: 20 })
    const task = seedRunningTask(mgr, { startedAt: new Date() })

    //#when
    ;(mgr as unknown as { armWallclock: (t: BackgroundTask) => void }).armWallclock(task)
    const supervisor = mgr as unknown as { wallclock: { size: () => number; getDeadlineAt: (id: string) => number | undefined } }
    expect(supervisor.wallclock.size()).toBe(1)
    const deadlineAt = supervisor.wallclock.getDeadlineAt(task.id) ?? 0
    expect(Math.abs(deadlineAt - (task.startedAt?.getTime() ?? 0) - 60000)).toBeLessThan(5000)
    await sleep(100)

    //#then
    expect(mgr.getTask(task.id)?.status).toBe("running")
    expect(abortCalls.length).toBe(0)
    ;(mgr as unknown as { disarmWallclock: (id: string) => void }).disarmWallclock(task.id)
    expect(supervisor.wallclock.size()).toBe(0)
    mgr.shutdown()
  })
})
