import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { getHandlePath, writeHandle } from "../../../src/features/background-agent/handle-index"
import { BackgroundManager } from "../../../src/features/background-agent/manager"
import type { BackgroundTask } from "../../../src/features/background-agent/types"

let dir: string
const managers: BackgroundManager[] = []

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "matrixx-bg-manager-"))
  managers.length = 0
})

afterEach(() => {
  for (const manager of managers) {
    try {
      manager.shutdown()
    } catch {
      // Best-effort cleanup between tests.
    }
  }
  rmSync(dir, { recursive: true, force: true })
})

function makeMockClient(directory: string) {
  return {
    session: {
      get: async () => ({ data: { directory } }),
      create: async () => ({ data: { id: "ses_child" } }),
      status: async () => ({ data: {} as Record<string, { type: string }> }),
      messages: async () => ({ data: [] }),
      promptAsync: async () => ({}),
      abort: async () => ({}),
      todo: async () => ({ data: [] }),
    },
  }
}

function makeManager(): BackgroundManager {
  const manager = new BackgroundManager({ client: makeMockClient(dir), directory: dir } as unknown as PluginInput)
  managers.push(manager)
  return manager
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out")
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

async function launchRunningTask(manager: BackgroundManager): Promise<BackgroundTask> {
  const task = await manager.launch({
    description: "Investigate the thing",
    prompt: "do the thing",
    agent: "explore",
    parentSessionID: "ses_parent",
    parentMessageID: "msg_parent",
  })
  await waitFor(() => manager.getTask(task.id)?.status === "running")
  return task
}

describe("BackgroundManager handle persistence", () => {
  test("restores a terminal handle after manager re-creation", async () => {
    //#given a manager whose task reached a terminal state
    const manager = makeManager()
    const task = await launchRunningTask(manager)
    await manager.cancelTask(task.id, { source: "test", abortSession: false, skipNotification: true })
    manager.shutdown()

    //#when a fresh manager starts up and restores from disk
    const restoredManager = makeManager()
    await restoredManager.restoreHandles()

    //#then the handle is recovered with its identity intact
    const restored = restoredManager.getTask(task.id)
    expect(restored).toBeDefined()
    expect(restored?.status).toBe("cancelled")
    expect(restored?.parentSessionID).toBe("ses_parent")
    expect(restored?.parentMessageID).toBe("msg_parent")
    expect(restored?.agent).toBe("explore")
  })

  test("reconciles a stale running handle to stopped without re-acquiring concurrency", async () => {
    //#given a manager that died while a task was still running
    const manager = makeManager()
    const task = await launchRunningTask(manager)
    manager.shutdown()

    //#when a fresh manager restores from disk and probes the (idle, empty) host
    const restoredManager = makeManager()
    await restoredManager.restoreHandles()

    //#then the task is truthfully stopped, its session re-attached, and no slot re-acquired
    const restored = restoredManager.getTask(task.id)
    expect(restored).toBeDefined()
    expect(restored?.status).toBe("stopped")
    expect(restored?.terminalReason).toBe("no-output")
    expect(restored?.sessionID).toBe("ses_child")
    expect(restored?.concurrencyKey).toBeUndefined()
    expect(restored?.concurrencyGroup).toBe("explore")
  })

  test("sweeps stale handle files on restore", async () => {
    //#given a handle file older than the TTL
    const stale: BackgroundTask = {
      id: "bg_staleold",
      parentSessionID: "ses_parent",
      parentMessageID: "msg_parent",
      description: "old task",
      prompt: "",
      agent: "explore",
      status: "completed",
      completedAt: new Date(Date.now() - 60 * 60 * 1000),
    }
    writeHandle(dir, stale)

    //#when a fresh manager restores from disk
    const restoredManager = makeManager()
    await restoredManager.restoreHandles()

    //#then the stale handle file is gone and never loaded
    expect(existsSync(getHandlePath(dir, "bg_staleold"))).toBe(false)
    expect(restoredManager.getTask("bg_staleold")).toBeUndefined()
  })

  test("writes one bg_*.json file per handle, never a shared background_tasks.json", async () => {
    //#given a manager with a terminal task
    const manager = makeManager()
    const task = await launchRunningTask(manager)
    await manager.cancelTask(task.id, { source: "test", abortSession: false, skipNotification: true })

    //#when inspecting the handle directory
    const files = readdirSync(join(dir, ".matrixx", "bg-handles"))

    //#then only per-handle files exist
    expect(files).toContain(`${task.id}.json`)
    expect(files.some((name) => name === "background_tasks.json")).toBe(false)
  })
})

describe("handle persistence source guard", () => {
  test("production sources contain no single-file background_tasks.json write", () => {
    //#given the background-agent production sources
    const sourceFiles = readdirSync(import.meta.dir).filter(
      (name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".bench.ts"),
    )

    //#when scanning each source for the legacy single-file store name
    //#then none reference it
    for (const name of sourceFiles) {
      const content = readFileSync(join(import.meta.dir, name), "utf-8")
      expect(content).not.toContain("background_tasks.json")
    }
  })
})
describe("session title repair on restore", () => {
  function makeRestoreClient(opts: { title?: string; getThrows?: boolean; updateCalls: unknown[] }) {
    return {
      session: {
        get: async () => {
          if (opts.getThrows) throw new Error("transport boom")
          return { data: { directory: dir, title: opts.title ?? "" } }
        },
        create: async () => ({ data: { id: "ses_child" } }),
        status: async () => ({ data: { ses_child: { type: "busy" } } }),
        messages: async () => ({ data: [] }),
        promptAsync: async () => ({}),
        abort: async () => ({}),
        todo: async () => ({ data: [] }),
        update: async (args: unknown) => {
          opts.updateCalls.push(args)
          return { data: {} }
        },
      },
    }
  }

  function persistRunningHandle(): BackgroundTask {
    const task: BackgroundTask = {
      id: "bg_abc12345",
      parentSessionID: "ses_parent",
      parentMessageID: "msg_parent",
      description: "Investigate the thing",
      prompt: "",
      agent: "explore",
      status: "running",
      sessionID: "ses_child",
      queuedAt: new Date(Date.now() - 2000),
      startedAt: new Date(Date.now() - 1000),
    }
    writeHandle(dir, task)
    return task
  }

  function makeRestoreManager(client: unknown): BackgroundManager {
    const manager = new BackgroundManager({ client, directory: dir } as unknown as PluginInput)
    managers.push(manager)
    return manager
  }

  test("repairs an empty session title on the running restore path", async () => {
    //#given a persisted running handle whose session title is empty
    persistRunningHandle()
    const updateCalls: unknown[] = []
    const manager = makeRestoreManager(makeRestoreClient({ title: "", updateCalls }))

    //#when restoring handles
    await manager.restoreHandles()

    //#then session.update is called with the shared title format
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]).toEqual({
      path: { id: "ses_child" },
      body: { title: "Investigate the thing (@explore subagent)" },
    })
    expect(manager.getTask("bg_abc12345")?.status).toBe("running")
  })

  test("skips repair when the session already has a title", async () => {
    //#given a persisted running handle whose session already has a title
    persistRunningHandle()
    const updateCalls: unknown[] = []
    const manager = makeRestoreManager(makeRestoreClient({ title: "keep me", updateCalls }))

    //#when restoring handles
    await manager.restoreHandles()

    //#then no title update is issued
    expect(updateCalls).toHaveLength(0)
    expect(manager.getTask("bg_abc12345")?.status).toBe("running")
  })

  test("a throwing session.get never rejects restoreHandles", async () => {
    //#given a persisted running handle with a failing session.get
    persistRunningHandle()
    const updateCalls: unknown[] = []
    const manager = makeRestoreManager(makeRestoreClient({ getThrows: true, updateCalls }))

    //#when restoring handles
    await manager.restoreHandles()

    //#then restore still resolves and the task is running
    expect(manager.getTask("bg_abc12345")?.status).toBe("running")
  })
})
