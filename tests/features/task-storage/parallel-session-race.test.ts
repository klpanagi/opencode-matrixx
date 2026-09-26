/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  acquireLock,
  acquireLockWithRetry,
  writeJsonAtomic,
} from "../../../src/features/task-storage/storage"
import { TaskSchema, type Task } from "../../../src/features/task-storage/types"

const STALE_LOCK_THRESHOLD_MS = 30000

let projectDir = ""
let taskDir = ""

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    subject: `Subject for ${id}`,
    description: "",
    status: "pending",
    blocks: [],
    blockedBy: [],
    ...overrides,
  }
}

/** One "parallel session": lock the shared dir, mutate, write atomically, unlock. */
async function runParallelSession(
  taskId: string,
  mutate: (task: Task) => Task
): Promise<{ acquired: boolean }> {
  const lock = await acquireLockWithRetry(taskDir, 200)
  if (!lock.acquired) return { acquired: false }
  try {
    const file = join(taskDir, `${taskId}.json`)
    const current = TaskSchema.parse(JSON.parse(readFileSync(file, "utf-8")))
    const next = mutate(current)
    writeJsonAtomic(file, next)
    // Yield between the write and the unlock so the other session interleaves.
    await new Promise(resolve => setTimeout(resolve, 1))
    return { acquired: true }
  } finally {
    lock.release()
  }
}

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "matrixx-parallel-session-"))
  taskDir = join(projectDir, ".matrixx", "tasks")
  writeJsonAtomic(join(taskDir, "T-shared.json"), makeTask("T-shared"))
})

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

describe("writeJsonAtomic", () => {
  test("writes through a temp file and renames it, leaving no temp residue", () => {
    //#given
    const file = join(taskDir, "T-atomic.json")

    //#when
    writeJsonAtomic(file, makeTask("T-atomic"))

    //#then
    expect(existsSync(file)).toBe(true)
    expect(readdirSync(taskDir).filter(f => f.startsWith("T-atomic.json.tmp"))).toEqual([])
  })

  test("a reader never observes a partially written file while writers churn", async () => {
    //#given
    const file = join(taskDir, "T-churn.json")
    const writers = 8
    let reads = 0
    let torn = 0

    //#when
    const writing = Array.from({ length: writers }, (_, i) =>
      writeJsonAtomic(file, makeTask("T-churn", { description: "x".repeat(50_000) + i }))
    )
    const reading = (async () => {
      while (reads < writers * 4) {
        if (existsSync(file)) {
          try {
            JSON.parse(readFileSync(file, "utf-8"))
            reads++
          } catch {
            torn++
          }
        }
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    })()
    await Promise.all([...writing, reading])

    //#then
    expect(torn).toBe(0)
    expect(reads).toBeGreaterThan(0)
  })
})

describe("acquireLock", () => {
  test("a fresh lock blocks a second acquisition", () => {
    //#given
    const first = acquireLock(taskDir)

    //#when
    const second = acquireLock(taskDir)

    //#then
    expect(first.acquired).toBe(true)
    expect(second.acquired).toBe(false)
    first.release()
  })

  test("a lock older than the 30s threshold is treated as stale and taken over", () => {
    //#given
    writeFileSync(
      join(taskDir, ".lock"),
      JSON.stringify({ id: "dead-owner", timestamp: Date.now() - (STALE_LOCK_THRESHOLD_MS + 1000) }),
      "utf-8"
    )

    //#when
    const lock = acquireLock(taskDir)

    //#then
    expect(lock.acquired).toBe(true)
    lock.release()
  })

  test("a lock just under the 30s threshold is still honored", () => {
    //#given
    writeFileSync(
      join(taskDir, ".lock"),
      JSON.stringify({ id: "live-owner", timestamp: Date.now() - (STALE_LOCK_THRESHOLD_MS - 5000) }),
      "utf-8"
    )

    //#when
    const lock = acquireLock(taskDir)

    //#then
    expect(lock.acquired).toBe(false)
  })

  test("release only removes the lock this holder owns", () => {
    //#given
    const first = acquireLock(taskDir)
    const stolen = join(taskDir, ".lock")
    writeFileSync(stolen, JSON.stringify({ id: "other-owner", timestamp: Date.now() }), "utf-8")

    //#when
    first.release()

    //#then
    expect(existsSync(stolen)).toBe(true)
  })
})

describe("parallel sessions against one task dir", () => {
  test("control: without the lock protocol two parallel sessions lose one update", async () => {
    //#given
    const file = join(taskDir, "T-shared.json")
    const readModifyWrite = async (mutate: (task: Task) => Task) => {
      const current = TaskSchema.parse(JSON.parse(readFileSync(file, "utf-8")))
      // The interleaving window a lock exists to close: read, yield, write.
      await new Promise(resolve => setTimeout(resolve, 1))
      writeJsonAtomic(file, mutate(current))
    }

    //#when
    await Promise.all([
      readModifyWrite(t => ({ ...t, status: "in_progress" })),
      readModifyWrite(t => ({ ...t, owner: "mouse" })),
    ])

    //#then
    const final = TaskSchema.parse(JSON.parse(readFileSync(file, "utf-8")))
    // Exactly one of the two writes survived — this is the lost update the
    // acquireLock protocol above prevents.
    const survivors = [final.status === "in_progress", final.owner === "mouse"].filter(Boolean)
    expect(survivors).toHaveLength(1)
  })

  test("two concurrent sessions both write and neither update is lost", async () => {
    //#given
    const file = join(taskDir, "T-shared.json")

    //#when
    const [a, b] = await Promise.all([
      runParallelSession("T-shared", t => ({ ...t, status: "in_progress" })),
      runParallelSession("T-shared", t => ({ ...t, owner: "mouse" })),
    ])

    //#then
    expect(a.acquired).toBe(true)
    expect(b.acquired).toBe(true)
    const final = TaskSchema.parse(JSON.parse(readFileSync(file, "utf-8")))
    expect(final.status).toBe("in_progress")
    expect(final.owner).toBe("mouse")
  })

  test("three concurrent sessions appending to the same array keep every contribution", async () => {
    //#given
    const file = join(taskDir, "T-shared.json")

    //#when
    await Promise.all(
      ["T-a", "T-b", "T-c"].map(id =>
        runParallelSession("T-shared", t => ({ ...t, blocks: [...t.blocks, id] }))
      )
    )

    //#then
    const final = TaskSchema.parse(JSON.parse(readFileSync(file, "utf-8")))
    expect(final.blocks.sort()).toEqual(["T-a", "T-b", "T-c"])
  })

  test("serialized access via acquireLockWithRetry under contention never throws", async () => {
    //#given
    const file = join(taskDir, "T-shared.json")
    const outcomes: number[] = []

    //#when
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        runParallelSession("T-shared", t => {
          outcomes.push(i)
          return { ...t, description: `writer ${i}` }
        })
      )
    )

    //#then
    expect(outcomes.length).toBe(5)
    expect(TaskSchema.parse(JSON.parse(readFileSync(file, "utf-8"))).description).toMatch(/^writer \d$/)
  })
})
