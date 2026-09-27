/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as loggerModule from "../../../src/shared/logger"
import { TaskCreateBatchInputSchema, TaskCreateInputSchema } from "../../../src/tools/task/types"

type TaskCreateModule = typeof import("../../../src/tools/task/task-create")

const TEST_STORAGE = "store"
const TEST_SESSION_ID = "batch-session-456"
const TEST_LIST_ID = "batch-test"
const ORIGINAL_CONFIG_DIR = process.env.OPENCODE_CONFIG_DIR

const TEST_CONTEXT = {
  sessionID: TEST_SESSION_ID,
  messageID: "test-message-456",
  agent: "test-agent",
  directory: "",
  worktree: "",
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
}

function countTaskFiles(dir: string): number {
  if (!existsSync(dir)) return 0
  return readdirSync(dir).filter((f) => f.startsWith("T-") && f.endsWith(".json")).length
}

function legacyTaskFile(id: string, subject: string): string {
  return JSON.stringify({
    id,
    subject,
    description: "",
    status: "pending",
    blocks: [],
    blockedBy: [],
    threadID: "legacy-session",
    projectRoot: "/legacy",
  })
}

describe("task_create batch support", () => {
  let testDir: string
  let configDir: string
  let storagePath: string
  let tool: ReturnType<TaskCreateModule["createTaskCreateTool"]>
  let logCalls: Array<{ msg: string; data?: unknown }>
  let testConfig: {
    morpheus: { tasks: { storage_path: string; task_list_id: string } }
  }

  beforeEach(async () => {
    mock.restore()
    logCalls = []

    mock.module("../../../src/shared/logger", () => ({
      ...loggerModule,
      log: (msg: string, data?: unknown) => {
        logCalls.push({ msg, data })
      },
    }))

    const cacheBuster = `${Date.now()}-${Math.random()}`
    const taskCreateModule: TaskCreateModule = await import(
      `../../../src/tools/task/task-create?test=${cacheBuster}`
    )

    testDir = join(
      tmpdir(),
      `task-create-batch-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    configDir = join(testDir, "opencode-config")
    storagePath = join(testDir, TEST_STORAGE)
    mkdirSync(storagePath, { recursive: true })
    mkdirSync(configDir, { recursive: true })
    process.env.OPENCODE_CONFIG_DIR = configDir
    testConfig = {
      morpheus: {
        tasks: { storage_path: storagePath, task_list_id: TEST_LIST_ID },
      },
    }
    tool = taskCreateModule.createTaskCreateTool(testConfig)
    TEST_CONTEXT.directory = testDir
  })

  afterEach(() => {
    if (ORIGINAL_CONFIG_DIR === undefined) {
      delete process.env.OPENCODE_CONFIG_DIR
    } else {
      process.env.OPENCODE_CONFIG_DIR = ORIGINAL_CONFIG_DIR
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
    mock.restore()
  })

  describe("single task (unchanged behaviour, one envelope)", () => {
    test("creates one task from a single object and returns the tasks/errors envelope", async () => {
      //#given
      const args = { subject: "Implement authentication" }

      //#when
      const result = JSON.parse(await tool.execute(args, TEST_CONTEXT))

      //#then
      expect(Object.keys(result).sort()).toEqual(["errors", "tasks"])
      expect(result.errors).toEqual([])
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].subject).toBe("Implement authentication")
      expect(result.tasks[0].id).toMatch(/^T-[a-f0-9-]+$/)
      expect(countTaskFiles(storagePath)).toBe(1)
    })

    test("uses the identical envelope for a single call and a one-item batch", async () => {
      //#given
      const single = { subject: "Envelope parity single" }
      const batch = { items: [{ subject: "Envelope parity batch" }] }

      //#when
      const singleResult = JSON.parse(await tool.execute(single, TEST_CONTEXT))
      const batchResult = JSON.parse(await tool.execute(batch, TEST_CONTEXT))

      //#then
      expect(Object.keys(singleResult).sort()).toEqual(Object.keys(batchResult).sort())
      expect(Object.keys(batchResult).sort()).toEqual(["errors", "tasks"])
      expect(batchResult.errors).toEqual([])
      expect(batchResult.tasks).toHaveLength(1)
    })
  })

  describe("multi-item batch", () => {
    test("creates three tasks and three files for three distinct subjects", async () => {
      //#given three DISTINCT subjects so per-item dedup cannot collapse the batch
      const args = {
        items: [
          { subject: "Batch item alpha" },
          { subject: "Batch item beta" },
          { subject: "Batch item gamma" },
        ],
      }

      //#when
      const result = JSON.parse(await tool.execute(args, TEST_CONTEXT))

      //#then
      expect(result.errors).toEqual([])
      expect(result.tasks).toHaveLength(3)
      expect(new Set(result.tasks.map((t: { id: string }) => t.id)).size).toBe(3)
      expect(result.tasks.map((t: { subject: string }) => t.subject)).toEqual([
        "Batch item alpha",
        "Batch item beta",
        "Batch item gamma",
      ])
      expect(countTaskFiles(storagePath)).toBe(3)
    })

    test("stamps threadID on every item in the batch", async () => {
      //#given
      const args = {
        items: [
          { subject: "Thread alpha" },
          { subject: "Thread beta" },
          { subject: "Thread gamma" },
        ],
      }

      //#when
      const result = JSON.parse(await tool.execute(args, TEST_CONTEXT))

      //#then every created file carries the session id
      expect(result.tasks).toHaveLength(3)
      for (const entry of result.tasks) {
        const content = JSON.parse(await Bun.file(join(storagePath, `${entry.id}.json`)).text())
        expect(content.threadID).toBe(TEST_SESSION_ID)
      }
    })

    test("carries a priority value through to the stored task", async () => {
      //#given
      const args = { items: [{ subject: "Prioritised batch item", priority: "high" }] }

      //#when
      const result = JSON.parse(await tool.execute(args, TEST_CONTEXT))

      //#then
      const content = JSON.parse(
        await Bun.file(join(storagePath, `${result.tasks[0].id}.json`)).text(),
      )
      expect(content.priority).toBe("high")
    })
  })

  describe("in-batch deduplication (strictly sequential write-then-scan)", () => {
    test("marks the second occurrence of a repeated subject as deduplicated", async () => {
      //#given
      const args = {
        items: [
          { subject: "Repeated subject" },
          { subject: "Repeated subject" },
          { subject: "Distinct trailing subject" },
        ],
      }

      //#when
      const result = JSON.parse(await tool.execute(args, TEST_CONTEXT))

      //#then the first write is visible to the second item's scan
      expect(result.errors).toEqual([])
      expect(result.tasks).toHaveLength(3)
      expect(result.tasks[0].deduplicated).toBeUndefined()
      expect(result.tasks[1].deduplicated).toBe(true)
      expect(result.tasks[1].id).toBe(result.tasks[0].id)
      expect(result.tasks[2].deduplicated).toBeUndefined()
      expect(result.tasks[2].id).not.toBe(result.tasks[0].id)
      expect(countTaskFiles(storagePath)).toBe(2)
    })
  })

  describe("partial batches", () => {
    test("fails only the invalid item and reports its index", async () => {
      //#given item 1 carries a malformed blockedBy id
      const args = {
        items: [
          { subject: "Valid first item" },
          { subject: "Invalid middle item", blockedBy: ["T-"] },
          { subject: "Valid last item" },
        ],
      }

      //#when
      const result = JSON.parse(await tool.execute(args, TEST_CONTEXT))

      //#then
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].index).toBe(1)
      expect(typeof result.errors[0].message).toBe("string")
      expect(result.tasks).toHaveLength(2)
      expect(result.tasks.map((t: { subject: string }) => t.subject)).toEqual([
        "Valid first item",
        "Valid last item",
      ])
      expect(countTaskFiles(storagePath)).toBe(2)
    })
  })

  describe("validation", () => {
    test("rejects an empty items array and writes nothing", async () => {
      //#given
      const args = { items: [] }

      //#when
      const result = JSON.parse(await tool.execute(args, TEST_CONTEXT))

      //#then
      expect(result.error).toBe("validation_error")
      expect(TaskCreateBatchInputSchema.safeParse({ items: [] }).success).toBe(false)
      expect(countTaskFiles(storagePath)).toBe(0)
    })

    test("rejects a status key outright instead of silently dropping it", async () => {
      //#given status belongs to task_update, not task_create
      const args = { subject: "Attempt to set status at create time", status: "in_progress" }

      //#when
      const result = JSON.parse(await tool.execute(args, TEST_CONTEXT))

      //#then
      expect(result.error).toBe("validation_error")
      expect(countTaskFiles(storagePath)).toBe(0)
      expect(TaskCreateInputSchema.safeParse({ subject: "x", status: "in_progress" }).success).toBe(
        false,
      )
    })

    test("rejects a status key on a batch item as a per-item error", async () => {
      //#given
      const args = {
        items: [
          { subject: "Batch item with illegal status", status: "completed" },
          { subject: "Legitimate batch item" },
        ],
      }

      //#when
      const result = JSON.parse(await tool.execute(args, TEST_CONTEXT))

      //#then
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].index).toBe(0)
      expect(result.tasks).toHaveLength(1)
    })

    test("a raw top-level array is unrepresentable in the batch schema", async () => {
      //#given the SDK requires a flat args record, so no array shape exists
      const args = [{ subject: "Bare array item" }]

      //#when
      const result = JSON.parse(await tool.execute(args as unknown as Record<string, unknown>, TEST_CONTEXT))

      //#then the batch schema rejects it outright
      expect(TaskCreateBatchInputSchema.safeParse([{ subject: "Bare array item" }]).success).toBe(
        false,
      )
      expect(result.error).toBe("validation_error")
      expect(countTaskFiles(storagePath)).toBe(0)
    })
  })

  describe("legacy migration (regression lock, not a harm fix)", () => {
    const projectDir = () => join(testDir, ".matrixx", "tasks")
    const legacyDir = () => join(configDir, "tasks", TEST_LIST_ID)

    function seedLegacyTask(): void {
      mkdirSync(legacyDir(), { recursive: true })
      writeFileSync(join(legacyDir(), "T-legacy-0001.json"), legacyTaskFile("T-legacy-0001", "Legacy task"))
    }

    test("copies legacy tasks once and a second execute is a no-op", async () => {
      //#given a legacy task waiting outside the project store
      seedLegacyTask()
      expect(countTaskFiles(projectDir())).toBe(0)

      //#when a batch creates three tasks
      const result = JSON.parse(
        await tool.execute(
          {
            items: [
              { subject: "Migration probe one" },
              { subject: "Migration probe two" },
              { subject: "Migration probe three" },
            ],
          },
          TEST_CONTEXT,
        ),
      )

      //#then the legacy task is copied in exactly once, and the legacy copy is retained
      expect(result.tasks).toHaveLength(3)
      expect(countTaskFiles(projectDir())).toBe(1)
      expect(existsSync(join(legacyDir(), "T-legacy-0001.json"))).toBe(true)

      //#and a second call migrates nothing further
      const second = JSON.parse(
        await tool.execute({ subject: "Migration probe four" }, TEST_CONTEXT),
      )
      expect(second.tasks).toHaveLength(1)
      expect(countTaskFiles(projectDir())).toBe(1)
      expect(existsSync(join(legacyDir(), "T-legacy-0001.json"))).toBe(true)
    })

    test("logs a migration throw and still creates the task", async () => {
      //#given .matrixx exists as a file, so creating the project task dir throws ENOTDIR
      seedLegacyTask()
      writeFileSync(join(testDir, ".matrixx"), "not a directory")

      //#when
      const result = JSON.parse(await tool.execute({ subject: "Survives migration failure" }, TEST_CONTEXT))

      //#then creation continued and the failure was logged rather than swallowed
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].subject).toBe("Survives migration failure")
      expect(countTaskFiles(storagePath)).toBe(1)

      const migrationLogs = logCalls.filter((entry) =>
        entry.msg.includes("[task-create]") && entry.msg.includes("Legacy task migration failed"),
      )
      expect(migrationLogs).toHaveLength(1)
      expect(JSON.stringify(migrationLogs[0].data)).toContain("ENOTDIR")
    })
  })
})
