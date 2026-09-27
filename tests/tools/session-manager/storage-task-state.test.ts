import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TaskObjectSchema } from "../../../src/tools/task/types"
import {
  resetStorageClient,
  setStorageClient,
  setStorageConfig,
  setStorageDirectory,
} from "../../../src/tools/session-manager/storage"

const PROJECT_DIR = join(tmpdir(), `matrixx-task-state-${randomUUID()}`)
const TASK_DIR = join(PROJECT_DIR, ".matrixx", "tasks")
const CONFIGURED_DIR = join(tmpdir(), `matrixx-configured-tasks-${randomUUID()}`)
const GLOBAL_CONFIG_DIR = join(tmpdir(), `matrixx-global-config-${randomUUID()}`)
const GLOBAL_LIST_ID = `t3-list-${randomUUID().slice(0, 8)}`

let todoCalls = 0

const countingClient = {
  session: {
    list: async () => ({ data: [] }),
    messages: async () => ({ data: [] }),
    todo: async () => {
      todoCalls += 1
      return { data: [] }
    },
  },
} as unknown as Parameters<typeof setStorageClient>[0]

function seedTask(
  overrides: {
    id: string
    subject: string
    status: "pending" | "in_progress" | "completed" | "deleted"
    threadID: string
  },
  dir: string = TASK_DIR
): void {
  mkdirSync(dir, { recursive: true })
  // Built through the real schema so a fixture can never be a silent false negative:
  // `TaskObjectSchema` is `.strict()` and requires `description` and `threadID`.
  const task = TaskObjectSchema.parse({
    id: overrides.id,
    subject: overrides.subject,
    description: "",
    status: overrides.status,
    blocks: [],
    blockedBy: [],
    threadID: overrides.threadID,
  })
  writeFileSync(join(dir, `${task.id}.json`), JSON.stringify(task))
}

async function readSessionTodos(sessionID: string) {
  const { readSessionTodos: read } = await import("../../../src/tools/session-manager/storage")
  return read(sessionID)
}

describe("readSessionTodos reads the file-backed task store", () => {
  beforeEach(() => {
    todoCalls = 0
    if (existsSync(PROJECT_DIR)) rmSync(PROJECT_DIR, { recursive: true, force: true })
    mkdirSync(PROJECT_DIR, { recursive: true })
    setStorageDirectory(PROJECT_DIR)
    setStorageClient(countingClient)
  })

  afterEach(() => {
    setStorageDirectory(undefined)
    resetStorageClient()
    if (existsSync(PROJECT_DIR)) rmSync(PROJECT_DIR, { recursive: true, force: true })
  })

  test("returns the task and never calls the OpenCode todo SDK", async () => {
    //#given a task attributed to the session under test
    seedTask({ id: `T-${randomUUID()}`, subject: "Task 1", status: "pending", threadID: "ses_test" })

    //#when the diagnostic runs
    const todos = await readSessionTodos("ses_test")

    //#then task state is returned and the SDK todo endpoint is untouched
    expect(todoCalls).toBe(0)
    expect(todos).toHaveLength(1)
    expect(todos[0].content).toBe("Task 1")
    expect(todos[0].status).toBe("pending")
  })

  test("returns only the requested session's tasks", async () => {
    //#given one task per session
    seedTask({ id: `T-${randomUUID()}`, subject: "Mine", status: "pending", threadID: "ses_test" })
    seedTask({ id: `T-${randomUUID()}`, subject: "Theirs", status: "pending", threadID: "ses_other" })

    //#when reading ses_test
    const todos = await readSessionTodos("ses_test")

    //#then the other session's task is not present
    expect(todos).toHaveLength(1)
    expect(todos[0].content).toBe("Mine")
  })

  test("maps a deleted task to the cancelled status", async () => {
    //#given a task in the terminal deleted state
    seedTask({ id: `T-${randomUUID()}`, subject: "Dropped", status: "deleted", threadID: "ses_test" })

    //#when reading it back
    const todos = await readSessionTodos("ses_test")

    //#then the status is translated rather than cast
    expect(todos[0].status).toBe("cancelled")
  })

  test("returns an empty array when no task store exists", async () => {
    //#given a project directory with no .matrixx/tasks at all
    //#when reading
    const todos = await readSessionTodos("ses_test")

    //#then the fail-open contract holds: empty, no throw
    expect(todos).toEqual([])
  })

  afterEach(() => {
    setStorageConfig(undefined)
  })
})

describe("readSessionTodos honours the configured task store", () => {
  beforeEach(() => {
    if (existsSync(PROJECT_DIR)) rmSync(PROJECT_DIR, { recursive: true, force: true })
    if (existsSync(CONFIGURED_DIR)) rmSync(CONFIGURED_DIR, { recursive: true, force: true })
    if (existsSync(GLOBAL_CONFIG_DIR)) rmSync(GLOBAL_CONFIG_DIR, { recursive: true, force: true })
    mkdirSync(PROJECT_DIR, { recursive: true })
    setStorageDirectory(PROJECT_DIR)
  })

  afterEach(() => {
    setStorageConfig(undefined)
    setStorageDirectory(undefined)
    if (existsSync(PROJECT_DIR)) rmSync(PROJECT_DIR, { recursive: true, force: true })
    if (existsSync(CONFIGURED_DIR)) rmSync(CONFIGURED_DIR, { recursive: true, force: true })
    if (existsSync(GLOBAL_CONFIG_DIR)) rmSync(GLOBAL_CONFIG_DIR, { recursive: true, force: true })
  })

  test("reads from tasks.storage_path instead of the project store", async () => {
    //#given a task that lives only in a custom store, reached via tasks.storage_path
    seedTask(
      { id: `T-${randomUUID()}`, subject: "Configured", status: "pending", threadID: "ses_test" },
      CONFIGURED_DIR
    )
    setStorageConfig({ tasks: { enabled: true, background_stale_after_hours: 2, storage_path: CONFIGURED_DIR } })

    //#when the diagnostic reads the session
    const todos = await readSessionTodos("ses_test")

    //#then the configured store is the one that was read
    expect(todos).toHaveLength(1)
    expect(todos[0].content).toBe("Configured")
  })

  test("reads from the global store when tasks.scope is global", async () => {
    //#given a task in the global store, addressed by an isolated config dir and list id
    const globalTaskDir = join(GLOBAL_CONFIG_DIR, "tasks", GLOBAL_LIST_ID)
    seedTask(
      { id: `T-${randomUUID()}`, subject: "Global", status: "pending", threadID: "ses_test" },
      globalTaskDir
    )
    const previousConfigDir = process.env.OPENCODE_CONFIG_DIR
    process.env.OPENCODE_CONFIG_DIR = GLOBAL_CONFIG_DIR
    setStorageConfig({
      tasks: { enabled: true, background_stale_after_hours: 2, scope: "global", task_list_id: GLOBAL_LIST_ID },
    })

    try {
      //#when the diagnostic reads the session
      const todos = await readSessionTodos("ses_test")

      //#then the global store is the one that was read
      expect(todos).toHaveLength(1)
      expect(todos[0].content).toBe("Global")
    } finally {
      if (previousConfigDir === undefined) delete process.env.OPENCODE_CONFIG_DIR
      else process.env.OPENCODE_CONFIG_DIR = previousConfigDir
    }
  })

  test("keeps the project store when no config is set", async () => {
    //#given a task in the project store and no plugin config at all
    seedTask({ id: `T-${randomUUID()}`, subject: "Project", status: "pending", threadID: "ses_test" })
    setStorageConfig(undefined)

    //#when the diagnostic reads the session
    const todos = await readSessionTodos("ses_test")

    //#then resolution is unchanged from the unset-config behaviour
    expect(todos).toHaveLength(1)
    expect(todos[0].content).toBe("Project")
  })
})
