import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  BG_HANDLE_FILE_PREFIX,
  type BgHandle,
  deleteHandleFile,
  getBgHandleDir,
  getHandlePath,
  readHandles,
  sweepStaleHandles,
  toHandle,
  writeHandle,
} from "./handle-index"
import type { BackgroundTask } from "./types"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "matrixx-bg-handles-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function makeTask(overrides: Partial<BackgroundTask> = {}): BackgroundTask {
  return {
    id: "bg_abc12345",
    parentSessionID: "ses_parent",
    parentMessageID: "msg_parent",
    description: "Investigate the thing",
    prompt: "secret prompt that must not be persisted",
    agent: "explore",
    status: "running",
    queuedAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: new Date("2026-01-01T00:00:05.000Z"),
    ...overrides,
  }
}

describe("getBgHandleDir / getHandlePath", () => {
  test("scopes handle files under .matrixx/bg-handles", () => {
    //#given a project directory
    //#when resolving the handle dir
    const handleDir = getBgHandleDir("/projects/alpha")

    //#then it is project-scoped under .matrixx/bg-handles
    expect(handleDir).toBe(join("/projects/alpha", ".matrixx", "bg-handles"))
  })

  test("uses one file per handle id", () => {
    //#given a project directory and task id
    //#when resolving the handle path
    const path = getHandlePath(dir, "bg_abc12345")

    //#then the file is named after the task id with a .json suffix
    expect(path).toBe(join(getBgHandleDir(dir), "bg_abc12345.json"))
  })
})

describe("writeHandle", () => {
  test("writes exactly one file per handle", () => {
    //#given a task
    const task = makeTask()

    //#when persisting the handle
    writeHandle(dir, task)

    //#then a single bg_*.json file exists (never a shared background_tasks.json)
    const files = readdirSync(getBgHandleDir(dir))
    expect(files).toEqual(["bg_abc12345.json"])
    expect(existsSync(join(getBgHandleDir(dir), "background_tasks.json"))).toBe(false)
  })

  test("leaves no temporary files behind after an atomic write", () => {
    //#given a task
    const task = makeTask()

    //#when persisting the handle
    writeHandle(dir, task)

    //#then no .tmp artifacts remain
    const files = readdirSync(getBgHandleDir(dir))
    expect(files.some((f) => f.includes(".tmp"))).toBe(false)
  })

  test("stores timestamps as epoch-millisecond numbers, not ISO strings", () => {
    //#given a task with Date timestamps
    const task = makeTask()

    //#when persisting and re-reading the handle
    writeHandle(dir, task)
    const [handle] = readHandles(dir)

    //#then timestamps round-trip as numbers
    expect(handle.queuedAt).toBe(task.queuedAt?.getTime())
    expect(handle.startedAt).toBe(task.startedAt?.getTime())
    expect(typeof handle.queuedAt).toBe("number")
  })

  test("does not persist ephemeral task fields", () => {
    //#given a task with prompt, progress and result payloads
    const task = makeTask({
      prompt: "do not persist",
      result: "do not persist",
      error: "do not persist",
      progress: { toolCalls: 3, lastUpdate: new Date() },
    })

    //#when persisting the handle
    writeHandle(dir, task)
    const [handle] = readHandles(dir)

    //#then only the lightweight index fields are present
    expect(handle).not.toHaveProperty("prompt")
    expect(handle).not.toHaveProperty("result")
    expect(handle).not.toHaveProperty("error")
    expect(handle).not.toHaveProperty("progress")
  })

  test("overwrites the same handle file on repeated writes", () => {
    //#given a task that is first running then completed
    const task = makeTask()

    //#when writing twice with a terminal status
    writeHandle(dir, task)
    writeHandle(dir, { ...task, status: "completed", completedAt: new Date(2_000) })

    //#then there is still one file reflecting the latest state
    const handles = readHandles(dir)
    expect(handles).toHaveLength(1)
    expect(handles[0].status).toBe("completed")
  })
})

describe("readHandles", () => {
  test("returns an empty array when the directory does not exist", () => {
    //#given a project with no handle directory
    //#when reading handles
    const handles = readHandles(dir)

    //#then nothing is returned
    expect(handles).toEqual([])
  })

  test("ignores files that are not bg_*.json handles", () => {
    //#given a stray non-handle file next to a valid handle
    writeHandle(dir, makeTask())
    writeFileSync(join(getBgHandleDir(dir), "notes.txt"), "ignore me", "utf-8")

    //#when reading handles
    const handles = readHandles(dir)

    //#then only the valid handle is returned
    expect(handles).toHaveLength(1)
    expect(handles[0].taskId).toBe("bg_abc12345")
  })

  test("skips corrupt JSON and schema-invalid files", () => {
    //#given a corrupt file and a schema-invalid handle file
    const handleDir = getBgHandleDir(dir)
    writeHandle(dir, makeTask())
    writeFileSync(join(handleDir, "bg_corrupt.json"), "{not json", "utf-8")
    writeFileSync(join(handleDir, "bg_invalid.json"), JSON.stringify({ taskId: 1 }), "utf-8")

    //#when reading handles
    const handles = readHandles(dir)

    //#then only the valid handle survives
    expect(handles.map((h) => h.taskId)).toEqual(["bg_abc12345"])
  })
})

describe("deleteHandleFile", () => {
  test("removes the handle file for a task id", () => {
    //#given a persisted handle
    writeHandle(dir, makeTask())

    //#when deleting it
    const deleted = deleteHandleFile(dir, "bg_abc12345")

    //#then the file is gone
    expect(deleted).toBe(true)
    expect(existsSync(getHandlePath(dir, "bg_abc12345"))).toBe(false)
    expect(readHandles(dir)).toEqual([])
  })

  test("returns false when the handle does not exist", () => {
    //#given no persisted handle
    //#when deleting a missing id
    const deleted = deleteHandleFile(dir, "bg_missing")

    //#then the call is a no-op
    expect(deleted).toBe(false)
  })
})

describe("sweepStaleHandles", () => {
  test("removes handles older than the TTL and keeps fresh ones", () => {
    //#given one stale handle and one fresh handle
    const now = Date.now()
    const stale = makeTask({ id: "bg_stale111", completedAt: new Date(now - 60 * 60 * 1000) })
    const fresh = makeTask({ id: "bg_fresh222", completedAt: new Date(now - 1000) })
    writeHandle(dir, stale)
    writeHandle(dir, fresh)

    //#when sweeping with the standard 30 minute TTL
    const removed = sweepStaleHandles(dir, 30 * 60 * 1000, now)

    //#then only the stale handle is removed
    expect(removed).toBe(1)
    expect(readHandles(dir).map((h) => h.taskId)).toEqual(["bg_fresh222"])
  })

  test("is bounded: a fresh handle is never removed", () => {
    //#given a handle completed one millisecond ago
    const now = Date.now()
    writeHandle(dir, makeTask({ completedAt: new Date(now - 1) }))

    //#when sweeping
    const removed = sweepStaleHandles(dir, 30 * 60 * 1000, now)

    //#then nothing is removed
    expect(removed).toBe(0)
    expect(readHandles(dir)).toHaveLength(1)
  })

  test("returns 0 when the handle directory does not exist", () => {
    //#given no handle directory
    //#when sweeping
    const removed = sweepStaleHandles(dir)

    //#then nothing happens
    expect(removed).toBe(0)
  })
})

describe("toHandle", () => {
  test("projects a BackgroundTask onto the lightweight handle shape", () => {
    //#given a fully populated task
    const task = makeTask({
      model: { providerID: "anthropic", modelID: "claude-sonnet-4" },
      category: "quick",
      concurrencyGroup: "anthropic/claude-sonnet-4",
    })

    //#when projecting to a handle
    const handle: BgHandle = toHandle(task)

    //#then the index carries identity, status, routing and epoch-ms timestamps
    expect(handle.taskId).toBe(task.id)
    expect(handle.parentSessionID).toBe(task.parentSessionID)
    expect(handle.parentMessageID).toBe(task.parentMessageID)
    expect(handle.agent).toBe(task.agent)
    expect(handle.status).toBe(task.status)
    expect(handle.model).toEqual(task.model)
    expect(handle.category).toBe("quick")
    expect(handle.concurrencyGroup).toBe("anthropic/claude-sonnet-4")
    expect(handle.queuedAt).toBe(task.queuedAt?.getTime())
    expect(handle.startedAt).toBe(task.startedAt?.getTime())
  })
})

describe("handle file prefix", () => {
  test("uses the bg_ prefix required by the acceptance criteria", () => {
    //#given the exported prefix constant
    //#when comparing against the task id format
    //#then handle ids and file names share the bg_ prefix
    expect(BG_HANDLE_FILE_PREFIX).toBe("bg_")
  })
})
