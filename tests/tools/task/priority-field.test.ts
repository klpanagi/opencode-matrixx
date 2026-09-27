import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { readSessionTasks } from "../../../src/features/task-session-scope/session-task-pending"
import type { Task } from "../../../src/features/task-storage/types"
import { getIncompleteTasks } from "../../../src/hooks/task-continuation-enforcer/todo"
import {
  TaskCreateInputSchema,
  TaskObjectSchema,
  TaskUpdateInputSchema,
} from "../../../src/tools/task/types"

const STORAGE_DIR = ".test-priority-field/tasks"

function minimalTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "T-11111111-1111-4111-8111-111111111111",
    subject: "Ship the priority field",
    description: "task_create examples already pass priority",
    status: "pending" as const,
    threadID: "ses_test",
    ...overrides,
  }
}

describe("TaskObjectSchema.priority", () => {
  test("accepts a priority value on a minimal task object", () => {
    //#given
    const task = { ...minimalTask(), priority: "high" }

    //#when
    const result = TaskObjectSchema.safeParse(task)

    //#then
    expect(result.success).toBe(true)
  })

  test("still parses a legacy task file that has no priority key", () => {
    //#given
    const legacy = minimalTask()

    //#when
    const result = TaskObjectSchema.safeParse(legacy)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.priority).toBeUndefined()
    }
  })

  test("preserves priority across a parse then stringify then parse round trip", () => {
    //#given
    const parsed = TaskObjectSchema.parse({ ...minimalTask(), priority: "medium" })

    //#when
    const rehydrated = TaskObjectSchema.parse(JSON.parse(JSON.stringify(parsed)))

    //#then
    expect(rehydrated.priority).toBe("medium")
  })

  test("rejects a priority value outside the enum", () => {
    //#given
    const task = { ...minimalTask(), priority: "urgent" }

    //#when
    const result = TaskObjectSchema.safeParse(task)

    //#then
    expect(result.success).toBe(false)
  })
})

describe("task_create and task_update input schemas", () => {
  test("task_create accepts a priority value", () => {
    //#given
    const input = { subject: "Ship the priority field", priority: "low" }

    //#when
    const result = TaskCreateInputSchema.safeParse(input)

    //#then
    expect(result.success).toBe(true)
  })

  test("task_create still accepts input without a priority value", () => {
    //#given
    const input = { subject: "Ship the priority field" }

    //#when
    const result = TaskCreateInputSchema.safeParse(input)

    //#then
    expect(result.success).toBe(true)
  })

  test("task_update accepts a priority value", () => {
    //#given
    const input = { id: "T-11111111-1111-4111-8111-111111111111", priority: "high" }

    //#when
    const result = TaskUpdateInputSchema.safeParse(input)

    //#then
    expect(result.success).toBe(true)
  })
})

describe("R5: priority has no reader", () => {
  const prior: Task = {
    ...minimalTask({ id: "T-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    blocks: [],
    blockedBy: [],
  }
  const blocked: Task = {
    ...minimalTask({
      id: "T-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      blockedBy: [prior.id],
    }),
    blocks: [],
    blockedBy: [prior.id],
  }
  const prioritized = { ...prior, priority: "high" }
  const prioritizedBlocked = { ...blocked, priority: "low" }

  beforeEach(() => {
    mkdirSync(STORAGE_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(STORAGE_DIR, { recursive: true, force: true })
  })

  test("getIncompleteTasks returns the same ids whatever the priority is", () => {
    //#given
    const withoutPriority = getIncompleteTasks([prior, blocked])
    const withPriority = getIncompleteTasks([
      prioritized as never,
      prioritizedBlocked as never,
    ])

    //#when
    const ids = (list: { id: string }[]) => list.map((task) => task.id)

    //#then
    expect(ids(withPriority)).toEqual(ids(withoutPriority))
  })

  test("readSessionTasks scopes the same tasks whatever the priority is", () => {
    //#given
    const config = { tasks: { enabled: true, storage_path: STORAGE_DIR } }
    const fixtures: (Task & { priority?: string })[] = [prior, blocked, prioritized]
    const query = {
      config,
      directory: process.cwd(),
      sessionID: "ses_test",
      excludeStale: false,
    }

    for (const fixture of fixtures) {
      const { priority, ...rest } = fixture
      writeFileSync(join(STORAGE_DIR, `${rest.id}.json`), JSON.stringify(rest))
    }
    const withoutPriority = readSessionTasks(query)

    for (const fixture of fixtures) {
      writeFileSync(join(STORAGE_DIR, `${fixture.id}.json`), JSON.stringify(fixture))
    }
    const withPriority = readSessionTasks(query)

    //#when
    const ids = (list: { id: string }[]) => list.map((task) => task.id).sort()

    //#then
    expect(ids(withPriority)).toEqual(ids(withoutPriority))
    expect(withoutPriority.length).toBeGreaterThan(0)
  })
})
