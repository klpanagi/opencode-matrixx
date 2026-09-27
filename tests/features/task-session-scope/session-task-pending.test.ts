/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { hasIncompleteTasksForSession, readSessionTasks } from "../../../src/features/task-session-scope"

const ID_A = "T-11111111-1111-1111-1111-111111111111"
const ID_B = "T-22222222-2222-2222-2222-222222222222"

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), "task-scope-"))
  mkdirSync(join(root, ".matrixx", "tasks"), { recursive: true })
  return root
}

function writeTask(root: string, id: string, task: Record<string, unknown>): void {
  writeFileSync(join(root, ".matrixx", "tasks", `${id}.json`), JSON.stringify(task))
}

function baseTask(id: string, threadID: string, status: string): Record<string, unknown> {
  return {
    id,
    subject: `subject ${id}`,
    description: "description",
    status,
    blocks: [],
    blockedBy: [],
    threadID,
  }
}

describe("hasIncompleteTasksForSession", () => {
  test("LIVELOCK FENCE: an unrelated session's pending task never counts as this session's pending work", () => {
    //#given a pending task owned by a different session
    const root = makeProject()
    try {
      writeTask(root, ID_A, baseTask(ID_A, "ses_unrelated", "pending"))

      //#when the predicate is asked about the target session
      const result = hasIncompleteTasksForSession({ directory: root, sessionID: "ses_target" })

      //#then it is false — strict scope, no cross-session blocking
      expect(result).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("the session's own in_progress task DOES count as pending work", () => {
    //#given an in_progress task owned by the queried session
    const root = makeProject()
    try {
      writeTask(root, ID_A, baseTask(ID_A, "ses_target", "in_progress"))

      //#when the predicate is asked about that session
      const result = hasIncompleteTasksForSession({ directory: root, sessionID: "ses_target" })

      //#then genuine unfinished work is still detected
      expect(result).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("a missing task directory fails open: false, no throw", () => {
    //#given a directory with no .matrixx/tasks at all
    const root = mkdtempSync(join(tmpdir(), "task-scope-empty-"))
    try {
      //#when the predicate is invoked
      const result = hasIncompleteTasksForSession({ directory: root, sessionID: "ses_target" })

      //#then it fails open without throwing
      expect(result).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("unparseable and unattributed task files are skipped, not fatal", () => {
    //#given one invalid-JSON file and one task missing the required threadID
    const root = makeProject()
    try {
      writeFileSync(join(root, ".matrixx", "tasks", `${ID_A}.json`), "{ not json")
      const noThread = baseTask(ID_B, "ses_target", "pending")
      delete noThread.threadID
      writeTask(root, ID_B, noThread)

      //#when the predicate runs over the corrupt store
      const result = hasIncompleteTasksForSession({ directory: root, sessionID: "ses_target" })

      //#then readJsonSafe returned null for both and the predicate is false
      expect(result).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("LIVELOCK FENCE: a dangling blockedBy is treated as satisfied so it cannot block forever", () => {
    //#given a pending task for the target session blocked by a task that does not exist
    const root = makeProject()
    try {
      const task = baseTask(ID_A, "ses_target", "pending")
      task.blockedBy = ["T-nonexistent"]
      writeTask(root, ID_A, task)

      //#when the predicate runs
      const result = hasIncompleteTasksForSession({ directory: root, sessionID: "ses_target" })

      //#then it is false — the unresolvable blocker fails the "completed" check
      expect(result).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("a stale task does not block because excludeStale defaults to true", () => {
    //#given a pending task for the target session whose file mtime is long past the stale threshold
    const root = makeProject()
    try {
      writeTask(root, ID_A, baseTask(ID_A, "ses_target", "pending"))
      const taskPath = join(root, ".matrixx", "tasks", `${ID_A}.json`)
      const old = new Date(Date.now() - 72 * 60 * 60 * 1000)
      utimesSync(taskPath, old, old)

      //#when the predicate runs with the default options
      const result = hasIncompleteTasksForSession({ directory: root, sessionID: "ses_target" })

      //#then a dead worker cannot leak a pending handle forever
      expect(result).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("subagent scope is explicit: included via subagentIDs, excluded when the list is empty", () => {
    //#given a pending task owned by a subagent session
    const root = makeProject()
    try {
      writeTask(root, ID_A, baseTask(ID_A, "ses_child", "pending"))

      //#when the parent session explicitly lists the child
      const included = hasIncompleteTasksForSession({
        directory: root,
        sessionID: "ses_parent",
        subagentIDs: ["ses_child"],
      })
      //#and the parent session lists no children
      const excluded = hasIncompleteTasksForSession({
        directory: root,
        sessionID: "ses_parent",
        subagentIDs: [],
      })

      //#then inclusion is explicit, never implicit
      expect(included).toBe(true)
      expect(excluded).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("tasks.session_scoped=false is deliberately ignored: this completion gate is always strictly scoped", () => {
    //#given session_scoped=false plus an unrelated session's pending task
    const root = makeProject()
    try {
      writeTask(root, ID_A, baseTask(ID_A, "ses_unrelated", "pending"))

      //#when the predicate runs with session_scoped disabled
      const result = hasIncompleteTasksForSession({
        config: { tasks: { enabled: true, session_scoped: false } },
        directory: root,
        sessionID: "ses_target",
      })

      //#then the key is honoured nowhere here — src/config/schema/tasks.ts documents
      //      it as governing the task-continuation-enforcer only, and honouring it
      //      would let an unrelated task reintroduce the never-completes livelock
      expect(result).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("readSessionTasks", () => {
  test("returns only strictly-scoped, non-stale tasks and never throws on a missing dir", () => {
    //#given a mix of scoped, unscoped, and stale task files
    const root = makeProject()
    try {
      writeTask(root, ID_A, baseTask(ID_A, "ses_target", "pending"))
      const staleTask = baseTask(ID_B, "ses_target", "pending")
      writeTask(root, ID_B, staleTask)
      const stalePath = join(root, ".matrixx", "tasks", `${ID_B}.json`)
      const old = new Date(Date.now() - 72 * 60 * 60 * 1000)
      utimesSync(stalePath, old, old)

      //#when the reader is invoked
      const scoped = readSessionTasks({ directory: root, sessionID: "ses_target" })
      //#and staleness exclusion is switched off
      const withStale = readSessionTasks({ directory: root, sessionID: "ses_target", excludeStale: false })
      const missing = readSessionTasks({ directory: mkdtempSync(join(tmpdir(), "task-none-")), sessionID: "s" })

      //#then only the fresh scoped task is returned by default
      expect(scoped.map((t) => t.id)).toEqual([ID_A])
      expect(withStale.map((t) => t.id).sort()).toEqual([ID_A, ID_B].sort())
      expect(missing).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
