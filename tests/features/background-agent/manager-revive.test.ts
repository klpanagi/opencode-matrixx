/// <reference types="bun-types" />
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { BackgroundTask } from "../../../src/features/background-agent/types"
import { BackgroundManager } from "../../../src/features/background-agent/manager"
import { writeHandle, readHandles } from "../../../src/features/background-agent/handle-index"

let TMP_DIR = ""

interface PromptCall {
  path: { id: string }
  body: { parts?: Array<{ type: string; text: string }>; [key: string]: unknown }
}

function makeClient() {
  const promptCalls: PromptCall[] = []
  const client = {
    session: {
      get: async () => ({ data: { directory: TMP_DIR } }),
      create: async () => ({ data: { id: "sess_new" } }),
      promptAsync: async (args: PromptCall) => {
        promptCalls.push(args)
        return {}
      },
      abort: async () => ({}),
      messages: async () => ({ data: [] }),
      todo: async () => ({ data: [] }),
      status: async () => ({}),
    },
  }
  return { client, promptCalls }
}

function makeManager(client: unknown, dir: string, config?: unknown): BackgroundManager {
  return new BackgroundManager({ client, directory: dir } as never, config as never)
}

function seedCompletedTask(overrides?: Partial<BackgroundTask>): BackgroundTask {
  const task: BackgroundTask = {
    id: "bg_revive01",
    status: "completed",
    sessionID: "sess_revive01",
    parentSessionID: "sess_parent01",
    parentMessageID: "msg_parent01",
    description: "revivable task",
    prompt: "old prompt",
    agent: "oracle",
    queuedAt: new Date("2026-01-01T00:00:00Z"),
    startedAt: new Date("2026-01-01T00:01:00Z"),
    completedAt: new Date(),
    ...overrides,
  }
  writeHandle(TMP_DIR, task)
  return task
}

describe("BackgroundManager.revive", () => {
  beforeEach(() => {
    TMP_DIR = mkdtempSync(join(tmpdir(), "revive-"))
  })

  afterEach(() => {
    try {
      rmSync(TMP_DIR, { recursive: true, force: true })
    } catch { /* best-effort */ }
  })

  test("(a) map-miss revive from a written handle file succeeds", async () => {
    //#given
    const { client, promptCalls } = makeClient()
    const mgr = makeManager(client, TMP_DIR)
    const seed = seedCompletedTask()
    const NEW_PROMPT = "fresh revive prompt"

    //#when
    const revived = await mgr.revive({
      taskId: seed.id,
      prompt: NEW_PROMPT,
      parentSessionID: "sess_parent01",
      parentMessageID: "msg_new01",
    })

    //#then
    expect(revived.status).toBe("running")
    expect(promptCalls.length).toBe(1)
    expect(promptCalls[0].path.id).toBe(seed.sessionID)
    expect(promptCalls[0].body.parts?.[0]?.text).toBe(NEW_PROMPT)
    mgr.shutdown()
  })

  test("(b) pruned-then-revived succeeds without Task not found", async () => {
    //#given
    const { client, promptCalls } = makeClient()
    const mgr = makeManager(client, TMP_DIR)
    const seed = seedCompletedTask({ id: "bg_pruned01", sessionID: "sess_pruned01" })
    const inMemory: BackgroundTask = { ...seed, prompt: "old" }
    mgr["tasks"].set(seed.id, inMemory)
    writeHandle(TMP_DIR, inMemory)
    mgr["tasks"].delete(seed.id)

    //#when
    const revived = await mgr.revive({
      taskId: seed.id,
      prompt: "revive after prune",
      parentSessionID: "sess_parent01",
      parentMessageID: "msg_prune01",
    })

    //#then
    expect(revived.status).toBe("running")
    expect(promptCalls.length).toBe(1)
    expect(promptCalls[0].path.id).toBe("sess_pruned01")
    mgr.shutdown()
  })

  test("(c) fresh manager revives without restoreHandles", async () => {
    //#given
    const { client: clientA } = makeClient()
    const mgrA = makeManager(clientA, TMP_DIR)
    const seed = seedCompletedTask({ id: "bg_fresh01", sessionID: "sess_fresh01" })
    expect(mgrA.getTask(seed.id)).toBeUndefined()
    const { client: clientB, promptCalls } = makeClient()
    const mgrB = makeManager(clientB, TMP_DIR)

    //#when
    expect(mgrB.getTask(seed.id)).toBeUndefined()
    const revived = await mgrB.revive({
      taskId: seed.id,
      prompt: "revive on cold manager",
      parentSessionID: "sess_parent01",
      parentMessageID: "msg_fresh01",
    })

    //#then
    expect(revived.status).toBe("running")
    expect(promptCalls.length).toBe(1)
    expect(promptCalls[0].path.id).toBe("sess_fresh01")
    mgrA.shutdown()
    mgrB.shutdown()
  })

  test("(d) running task revive returns it unchanged", async () => {
    //#given
    const { client, promptCalls } = makeClient()
    const mgr = makeManager(client, TMP_DIR)
    const running: BackgroundTask = {
      id: "bg_running01",
      status: "running",
      sessionID: "sess_running01",
      parentSessionID: "sess_parent01",
      parentMessageID: "msg_run01",
      description: "running task",
      prompt: "original",
      agent: "oracle",
      startedAt: new Date(),
    }
    mgr["tasks"].set(running.id, running)

    //#when
    const result = await mgr.revive({
      taskId: running.id,
      prompt: "should be ignored",
      parentSessionID: "sess_parent01",
      parentMessageID: "msg_run02",
    })

    //#then
    expect(result.status).toBe("running")
    expect(result.prompt).toBe("original")
    expect(promptCalls.length).toBe(0)
    mgr.shutdown()
  })

  test("(e) statusUncertain without force throws, with force proceeds", async () => {
    //#given
    const { client, promptCalls } = makeClient()
    const mgr = makeManager(client, TMP_DIR)
    seedCompletedTask({ id: "bg_uncertain01", sessionID: "sess_uncertain01", status: "statusUncertain" })

    //#when
    let thrown: Error | undefined
    try {
      await mgr.revive({
        taskId: "bg_uncertain01",
        prompt: "retry",
        parentSessionID: "sess_parent01",
        parentMessageID: "msg_unc01",
      })
    } catch (error) {
      thrown = error as Error
    }

    //#then
    expect(thrown).toBeDefined()
    expect(thrown!.message).toContain("unknown liveness")

    //#when
    const revived = await mgr.revive({
      taskId: "bg_uncertain01",
      prompt: "forced retry",
      parentSessionID: "sess_parent01",
      parentMessageID: "msg_unc02",
      force: true,
    })

    //#then
    expect(revived.status).toBe("running")
    expect(promptCalls.length).toBe(1)
    expect(promptCalls[0].body.parts?.[0]?.text).toBe("forced retry")
    mgr.shutdown()
  })

  test("(f) handle with no sessionID throws no-session guidance", async () => {
    //#given
    const { client } = makeClient()
    const mgr = makeManager(client, TMP_DIR)
    const seed: BackgroundTask = {
      id: "bg_nosess01",
      status: "completed",
      parentSessionID: "sess_parent01",
      parentMessageID: "msg_nosess01",
      description: "no session task",
      prompt: "old",
      agent: "oracle",
      completedAt: new Date(),
    }
    writeHandle(TMP_DIR, seed)

    //#when
    let thrown: Error | undefined
    try {
      await mgr.revive({
        taskId: seed.id,
        prompt: "retry",
        parentSessionID: "sess_parent01",
        parentMessageID: "msg_nosess02",
      })
    } catch (error) {
      thrown = error as Error
    }

    //#then
    expect(thrown).toBeDefined()
    expect(thrown!.message).toContain("has no session")
    mgr.shutdown()
  })

  test("(g) admission timeout stops task with queue-saturated and persists", async () => {
    //#given
    const { client } = makeClient()
    const mgr = makeManager(client, TMP_DIR, { defaultConcurrency: 1, admissionTimeoutMs: 30 })
    const seed = seedCompletedTask({ id: "bg_sat01", sessionID: "sess_sat01", agent: "oracle" })
    await mgr["concurrencyManager"].acquire("oracle")

    //#when
    let thrown: Error | undefined
    try {
      await mgr.revive({
        taskId: seed.id,
        prompt: "saturated retry",
        parentSessionID: "sess_parent01",
        parentMessageID: "msg_sat01",
      })
    } catch (error) {
      thrown = error as Error
    }

    //#then
    expect(thrown).toBeDefined()
    const task = mgr.getTask(seed.id)
    expect(task?.status).toBe("stopped")
    expect(task?.terminalReason).toBe("queue-saturated")
    const handles = readHandles(TMP_DIR)
    const persisted = handles.find((h) => h.taskId === seed.id)
    expect(persisted?.status).toBe("stopped")
    mgr.shutdown()
  })

  test("listRevivable merges memory and disk, dedupes, scopes, sorts", async () => {
    //#given
    const { client } = makeClient()
    const mgr = makeManager(client, TMP_DIR)
    const older = seedCompletedTask({
      id: "bg_list_old",
      sessionID: "sess_list_old",
      description: "older",
      completedAt: new Date("2026-01-01T00:00:00Z"),
    })
    const newer = seedCompletedTask({
      id: "bg_list_new",
      sessionID: "sess_list_new",
      description: "newer",
      parentSessionID: "sess_other_parent",
      completedAt: new Date("2026-06-01T00:00:00Z"),
    })
    void older
    void newer

    //#when
    const all = mgr.listRevivable()
    const scoped = mgr.listRevivable("sess_other_parent")

    //#then
    const ids = all.map((e) => e.taskId)
    expect(ids).toContain("bg_list_old")
    expect(ids).toContain("bg_list_new")
    expect(all.findIndex((e) => e.taskId === "bg_list_new")).toBeLessThan(
      all.findIndex((e) => e.taskId === "bg_list_old"),
    )
    expect(scoped.map((e) => e.taskId)).toEqual(["bg_list_new"])
    mgr.shutdown()
  })
})
