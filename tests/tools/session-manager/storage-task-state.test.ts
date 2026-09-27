import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetStorageClient, setStorageClient, setStorageDirectory } from "../../../src/tools/session-manager/storage"

const PROJECT_DIR = join(tmpdir(), `matrixx-task-state-${randomUUID()}`)
const TASK_DIR = join(PROJECT_DIR, ".matrixx", "tasks")

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

function seedTask(overrides: {
  id: string
  subject: string
  status: "pending" | "in_progress" | "completed" | "deleted"
  threadID: string
}): void {
  mkdirSync(TASK_DIR, { recursive: true })
  writeFileSync(
    join(TASK_DIR, `${overrides.id}.json`),
    JSON.stringify({
      id: overrides.id,
      subject: overrides.subject,
      description: "",
      status: overrides.status,
      blocks: [],
      blockedBy: [],
      threadID: overrides.threadID,
    })
  )
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
})
