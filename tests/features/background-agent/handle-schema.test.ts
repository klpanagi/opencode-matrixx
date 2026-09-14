/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  BgHandleSchema,
  getBgHandleDir,
  readHandles,
  toHandle,
  writeHandle,
} from "../../../src/features/background-agent/handle-index"
import type { BackgroundTask } from "../../../src/features/background-agent/types"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "matrixx-bg-handle-schema-"))
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

const ALL_STATUSES = [
  "pending",
  "running",
  "completed",
  "error",
  "cancelled",
  "interrupt",
  "stopped",
  "statusUncertain",
] as const

function basePayload(status: string, extra: Record<string, unknown> = {}) {
  return {
    taskId: "bg_abc12345",
    parentSessionID: "ses_parent",
    parentMessageID: "msg_parent",
    description: "Investigate the thing",
    agent: "explore",
    status,
    ...extra,
  }
}

describe("BgHandleSchema status vocabulary", () => {
  test("accepts all 8 status values", () => {
    //#given a handle payload for each status in the widened vocabulary
    for (const status of ALL_STATUSES) {
      //#when parsing against the strict schema
      const result = BgHandleSchema.safeParse(basePayload(status))

      //#then every status round-trips without error
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe(status)
      }
    }
  })

  test("parses a legacy handle with status interrupt and no sessionID/terminalReason", () => {
    //#given a legacy handle JSON written before sessionID/terminalReason existed
    const result = BgHandleSchema.safeParse(
      basePayload("interrupt", { queuedAt: 1_767_225_600_000 }),
    )

    //#when parsing against the widened strict schema
    //#then it still parses and the new fields are absent
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe("interrupt")
      expect(result.data.sessionID).toBeUndefined()
      expect(result.data.terminalReason).toBeUndefined()
    }
  })

  test("rejects an unknown key (strict mode preserved)", () => {
    //#given a handle payload carrying a key outside the schema
    const result = BgHandleSchema.safeParse(
      basePayload("running", { rogueKey: "must be rejected" }),
    )

    //#when parsing against the strict schema
    //#then the unknown key fails validation
    expect(result.success).toBe(false)
  })

  test("accepts sessionID and terminalReason when present", () => {
    //#given a handle payload with the new fields populated
    const result = BgHandleSchema.safeParse(
      basePayload("stopped", { sessionID: "ses_child", terminalReason: "no-output" }),
    )

    //#when parsing against the strict schema
    //#then both new fields survive
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sessionID).toBe("ses_child")
      expect(result.data.terminalReason).toBe("no-output")
    }
  })
})

describe("toHandle projection", () => {
  test("projects sessionID and terminalReason onto the handle", () => {
    //#given a task with sessionID and terminalReason set
    const task = makeTask({ sessionID: "ses_child", status: "stopped", terminalReason: "no-output" })

    //#when projecting to a handle
    const handle = toHandle(task)

    //#then the new fields are carried over
    expect(handle.sessionID).toBe("ses_child")
    expect(handle.terminalReason).toBe("no-output")
  })
})

describe("handle round-trip", () => {
  test("sessionID survives toHandle -> writeHandle -> readHandles", () => {
    //#given a task with a child session id
    const task = makeTask({ sessionID: "ses_child" })

    //#when persisting and re-reading the handle
    writeHandle(dir, task)
    const [handle] = readHandles(dir)

    //#then the session id is persisted on disk
    expect(handle.sessionID).toBe("ses_child")
  })

  test("terminalReason survives toHandle -> writeHandle -> readHandles", () => {
    //#given a task with a terminal reason
    const task = makeTask({ status: "stopped", terminalReason: "no-output" })

    //#when persisting and re-reading the handle
    writeHandle(dir, task)
    const [handle] = readHandles(dir)

    //#then the terminal reason is persisted on disk
    expect(handle.terminalReason).toBe("no-output")
  })

  test("legacy handle file on disk still loads through readHandles", () => {
    //#given a legacy handle file written directly to disk without new fields
    const handleDir = getBgHandleDir(dir)
    mkdirSync(handleDir, { recursive: true })
    writeFileSync(
      join(handleDir, "bg_legacy002.json"),
      JSON.stringify(basePayload("interrupt", { taskId: "bg_legacy002" })),
      "utf-8",
    )

    //#when reading all handles
    const handles = readHandles(dir)

    //#then the legacy handle is still returned
    expect(handles).toHaveLength(1)
    expect(handles[0].status).toBe("interrupt")
  })
})