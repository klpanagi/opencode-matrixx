/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeJsonAtomic } from "../../../src/features/task-storage/storage"
import { createTaskCleanupTool } from "../../../src/tools/task/task-cleanup"
import type { TaskObject } from "../../../src/tools/task/types"

function makeTask(overrides: Partial<TaskObject> & { id: string; subject: string }): TaskObject {
  return {
    description: "",
    status: "pending",
    blocks: [],
    blockedBy: [],
    threadID: "ses-test",
    ...overrides,
  } as TaskObject
}

describe("createTaskCleanupTool", () => {
  let tmpDir: string
  let config: Partial<import("../../../src/config/schema").MatrixxConfig>

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "matrixx-task-cleanup-"))
    config = { morpheus: { tasks: { storage_path: tmpDir } } } as unknown as Partial<import("../../../src/config/schema").MatrixxConfig>
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  })

  test("deletes only completed, keeps pending", async () => {
    //#given 2 completed + 1 pending
    const completed1 = makeTask({ id: "T-aaa-1", subject: "Done 1", status: "completed" })
    const completed2 = makeTask({ id: "T-bbb-2", subject: "Done 2", status: "completed" })
    const pending = makeTask({ id: "T-ccc-3", subject: "Todo", status: "pending" })
    writeJsonAtomic(join(tmpDir, `${completed1.id}.json`), completed1)
    writeJsonAtomic(join(tmpDir, `${completed2.id}.json`), completed2)
    writeJsonAtomic(join(tmpDir, `${pending.id}.json`), pending)

    const tool = createTaskCleanupTool(config)

    //#when executing without filter
    const raw = await tool.execute({}, { sessionID: "sess-test" } as never)
    const result = JSON.parse(raw as string)

    //#then deleted 2, remaining 1, pending file still exists
    expect(result.deleted).toBe(2)
    expect(result.remaining).toBe(1)
    expect(result.deletedIds).toHaveLength(2)
    expect(result.deletedIds).toContain("T-aaa-1")
    expect(result.deletedIds).toContain("T-bbb-2")
    expect(existsSync(join(tmpDir, "T-aaa-1.json"))).toBe(false)
    expect(existsSync(join(tmpDir, "T-bbb-2.json"))).toBe(false)
    expect(existsSync(join(tmpDir, "T-ccc-3.json"))).toBe(true)
  })

  test("respects olderThan filter: deletes only old completed", async () => {
    //#given completed now vs completed 8 days ago
    const now = Date.now()
    const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000
    const recent = makeTask({ id: "T-recent", subject: "Recent", status: "completed" })
    const old = makeTask({ id: "T-old", subject: "Old", status: "completed" })
    writeFileSync(join(tmpDir, "T-recent.json"), JSON.stringify({ ...recent, time_updated: now }), "utf-8")
    writeFileSync(join(tmpDir, "T-old.json"), JSON.stringify({ ...old, time_updated: eightDaysAgo }), "utf-8")

    const tool = createTaskCleanupTool(config)

    //#when olderThan 7d
    const raw = await tool.execute({ olderThan: "7d" }, { sessionID: "sess-test" } as never)
    const result = JSON.parse(raw as string)

    //#then only old deleted
    expect(result.deleted).toBe(1)
    expect(result.deletedIds).toContain("T-old")
    expect(result.deletedIds).not.toContain("T-recent")
    expect(existsSync(join(tmpDir, "T-old.json"))).toBe(false)
    expect(existsSync(join(tmpDir, "T-recent.json"))).toBe(true)
    expect(result.remaining).toBe(1)
  })

  test("ignores in_progress and pending, only deletes terminal statuses", async () => {
    //#given pending + in_progress + completed
    const pending = makeTask({ id: "T-p1", subject: "Pending", status: "pending" })
    const inProgress = makeTask({ id: "T-ip1", subject: "In progress", status: "in_progress" })
    const completed = makeTask({ id: "T-c1", subject: "Done", status: "completed" })
    writeJsonAtomic(join(tmpDir, `${pending.id}.json`), pending)
    writeJsonAtomic(join(tmpDir, `${inProgress.id}.json`), inProgress)
    writeJsonAtomic(join(tmpDir, `${completed.id}.json`), completed)

    const tool = createTaskCleanupTool(config)

    //#when
    const raw = await tool.execute({}, { sessionID: "sess-test" } as never)
    const result = JSON.parse(raw as string)

    //#then only completed deleted
    expect(result.deleted).toBe(1)
    expect(result.deletedIds).toContain("T-c1")
    expect(result.deletedIds).not.toContain("T-p1")
    expect(result.deletedIds).not.toContain("T-ip1")
    expect(existsSync(join(tmpDir, "T-p1.json"))).toBe(true)
    expect(existsSync(join(tmpDir, "T-ip1.json"))).toBe(true)
    expect(existsSync(join(tmpDir, "T-c1.json"))).toBe(false)
    expect(result.remaining).toBe(2)
  })

  test("deletes deleted-status tasks alongside completed", async () => {
    //#given one completed and one deleted, both terminal
    const completed = makeTask({ id: "T-c1", subject: "Done", status: "completed" })
    const deleted = makeTask({ id: "T-d1", subject: "Superseded", status: "deleted" })
    const pending = makeTask({ id: "T-p1", subject: "Pending", status: "pending" })
    writeJsonAtomic(join(tmpDir, `${completed.id}.json`), completed)
    writeJsonAtomic(join(tmpDir, `${deleted.id}.json`), deleted)
    writeJsonAtomic(join(tmpDir, `${pending.id}.json`), pending)

    const tool = createTaskCleanupTool(config)

    //#when
    const raw = await tool.execute({}, { sessionID: "sess-test" } as never)
    const result = JSON.parse(raw as string)

    //#then both terminal statuses reclaimed, active work untouched
    expect(result.deleted).toBe(2)
    expect(result.deletedIds).toContain("T-c1")
    expect(result.deletedIds).toContain("T-d1")
    expect(existsSync(join(tmpDir, "T-d1.json"))).toBe(false)
    expect(existsSync(join(tmpDir, "T-p1.json"))).toBe(true)
    expect(result.remaining).toBe(1)
  })

  test("stale:true reclaims stale pending and in_progress beyond config threshold", async () => {
    //#given config threshold of 1h, with a 2h-old pending and a 2h-old in_progress
    const staleConfig = {
      tasks: { storage_path: tmpDir, stale_after_hours: 1 },
    } as unknown as Partial<import("../../../src/config/schema").MatrixxConfig>
    const twoHoursAgo = (Date.now() - 2 * 60 * 60 * 1000) / 1000
    const pending = makeTask({ id: "T-p1", subject: "Abandoned pending", status: "pending" })
    const inProgress = makeTask({ id: "T-ip1", subject: "Abandoned in progress", status: "in_progress" })
    for (const t of [pending, inProgress]) {
      const p = join(tmpDir, `${t.id}.json`)
      writeJsonAtomic(p, t)
      utimesSync(p, twoHoursAgo, twoHoursAgo)
    }

    const tool = createTaskCleanupTool(staleConfig)

    //#when
    const raw = await tool.execute({ stale: true }, { sessionID: "sess-test" } as never)
    const result = JSON.parse(raw as string)

    //#then both stale active tasks reclaimed
    expect(result.deleted).toBe(2)
    expect(result.deletedIds).toContain("T-p1")
    expect(result.deletedIds).toContain("T-ip1")
    expect(existsSync(join(tmpDir, "T-p1.json"))).toBe(false)
    expect(existsSync(join(tmpDir, "T-ip1.json"))).toBe(false)
  })

  test("stale:true keeps fresh pending and in_progress", async () => {
    //#given config threshold of 24h with tasks written just now
    const staleConfig = {
      tasks: { storage_path: tmpDir, stale_after_hours: 24 },
    } as unknown as Partial<import("../../../src/config/schema").MatrixxConfig>
    const pending = makeTask({ id: "T-p1", subject: "Fresh pending", status: "pending" })
    const inProgress = makeTask({ id: "T-ip1", subject: "Fresh in progress", status: "in_progress" })
    writeJsonAtomic(join(tmpDir, `${pending.id}.json`), pending)
    writeJsonAtomic(join(tmpDir, `${inProgress.id}.json`), inProgress)

    const tool = createTaskCleanupTool(staleConfig)

    //#when
    const raw = await tool.execute({ stale: true }, { sessionID: "sess-test" } as never)
    const result = JSON.parse(raw as string)

    //#then nothing reclaimed
    expect(result.deleted).toBe(0)
    expect(existsSync(join(tmpDir, "T-p1.json"))).toBe(true)
    expect(existsSync(join(tmpDir, "T-ip1.json"))).toBe(true)
  })

  test("stale omitted keeps stale pending even when olderThan would match", async () => {
    //#given a 2h-old pending task and a default (non-stale) invocation
    const twoHoursAgo = (Date.now() - 2 * 60 * 60 * 1000) / 1000
    const pending = makeTask({ id: "T-p1", subject: "Old pending", status: "pending" })
    const p = join(tmpDir, `${pending.id}.json`)
    writeJsonAtomic(p, pending)
    utimesSync(p, twoHoursAgo, twoHoursAgo)

    const tool = createTaskCleanupTool(config)

    //#when
    const raw = await tool.execute({ olderThan: "1h" }, { sessionID: "sess-test" } as never)
    const result = JSON.parse(raw as string)

    //#then active work is never reclaimed without opting into stale
    expect(result.deleted).toBe(0)
    expect(existsSync(p)).toBe(true)
  })

  test("stale:true honours olderThan as the threshold when provided", async () => {
    //#given a 40-minute-old pending task against a 1h olderThan
    const fortyMinAgo = (Date.now() - 40 * 60 * 1000) / 1000
    const pending = makeTask({ id: "T-p1", subject: "Recent-ish", status: "pending" })
    const p = join(tmpDir, `${pending.id}.json`)
    writeJsonAtomic(p, pending)
    utimesSync(p, fortyMinAgo, fortyMinAgo)

    const tool = createTaskCleanupTool(config)

    //#when
    const raw = await tool.execute({ stale: true, olderThan: "1h" }, { sessionID: "sess-test" } as never)
    const result = JSON.parse(raw as string)

    //#then younger than the explicit threshold, so kept
    expect(result.deleted).toBe(0)
    expect(existsSync(p)).toBe(true)
  })

  test("returns validation error for invalid olderThan", async () => {
    //#given
    const tool = createTaskCleanupTool(config)
    //#when invalid format
    const raw = await tool.execute({ olderThan: "bad" }, { sessionID: "sess-test" } as never)
    const result = JSON.parse(raw as string)
    //#then error
    expect(result.error).toBe("validation_error")
  })
})
