/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { hasIncompleteTasksForSession, readSessionTasks } from "../../../src/features/task-session-scope"
import { TaskObjectSchema } from "../../../src/tools/task/types"

function id(n: number): string {
  return `T-${String(n).repeat(8)}`
}

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), "task-ancestry-"))
  mkdirSync(join(root, ".matrixx", "tasks"), { recursive: true })
  return root
}

function taskPath(root: string, taskID: string): string {
  return join(root, ".matrixx", "tasks", `${taskID}.json`)
}

/**
 * Fixtures MUST go through `TaskObjectSchema.parse` — a hand-rolled object
 * missing `description` (or any other required key) fails the `.strict()` schema
 * and produces a convincing false negative instead of a real scope failure.
 */
function writeTask(root: string, taskID: string, fields: Record<string, unknown>): string {
  const task = TaskObjectSchema.parse({
    id: taskID,
    subject: `subject ${taskID}`,
    description: "",
    status: "pending",
    blocks: [],
    blockedBy: [],
    projectRoot: root,
    ...fields,
  })
  const path = taskPath(root, taskID)
  writeFileSync(path, JSON.stringify(task))
  return path
}

/** Age a task file past `hours` so `isTaskStale` reports it stale. */
function ageFile(path: string, hours: number): void {
  const when = new Date(Date.now() - hours * 60 * 60 * 1000)
  utimesSync(path, when, when)
}

function withTempProject(fn: (root: string) => void): void {
  const root = makeProject()
  try {
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe("durable parentID ancestry scope", () => {
  test("a grandchild task two hops below a session-rooted task IS in scope", () => {
    withTempProject((root) => {
      //#given T-1 belongs to the session; T-2 is its child; T-3 is T-2's child
      writeTask(root, id(1), { threadID: "ses_root" })
      writeTask(root, id(2), { threadID: "ses_child", parentID: id(1) })
      writeTask(root, id(3), { threadID: "ses_grandchild", parentID: id(2) })

      //#when the child session's scope is read
      const found = readSessionTasks({ directory: root, sessionID: "ses_child" })

      //#then the two-hop descendant chain is in scope
      expect(found.map((t) => t.id).sort()).toEqual([id(2), id(3)].sort())
    })
  })

  test("a grandchild two hops below the session root holds the root session open", () => {
    withTempProject((root) => {
      //#given the session's own task is completed but a grandchild's is still open
      writeTask(root, id(1), { threadID: "ses_root", status: "completed" })
      writeTask(root, id(2), { threadID: "ses_child", parentID: id(1), status: "completed" })
      writeTask(root, id(3), { threadID: "ses_grandchild", parentID: id(2) })

      //#when the gate asks whether the root session still has pending work
      const pending = hasIncompleteTasksForSession({ directory: root, sessionID: "ses_root" })

      //#then the still-open grandchild keeps it open
      expect(pending).toBe(true)
    })
  })

  test("DEPTH BOUNDARY: only three parentID hops are followed; the fourth is excluded", () => {
    withTempProject((root) => {
      //#given a 5-deep chain where only T-1 carries the queried session's threadID
      writeTask(root, id(1), { threadID: "ses_root" })
      writeTask(root, id(2), { threadID: "ses_2", parentID: id(1) })
      writeTask(root, id(3), { threadID: "ses_3", parentID: id(2) })
      writeTask(root, id(4), { threadID: "ses_4", parentID: id(3) })
      writeTask(root, id(5), { threadID: "ses_5", parentID: id(4) })

      //#when the root session's scope is read
      const found = readSessionTasks({ directory: root, sessionID: "ses_root" }).map((t) => t.id)

      //#then T-1..T-4 are present (hops 0..3) and T-5 is at hop 4 — excluded
      expect(found).toContain(id(1))
      expect(found).toContain(id(2))
      expect(found).toContain(id(3))
      expect(found).toContain(id(4))
      expect(found).not.toContain(id(5))
    })
  })

  test("ancestryDepth narrows the walk when the caller asks for fewer hops", () => {
    withTempProject((root) => {
      //#given the same 3-hop chain
      writeTask(root, id(1), { threadID: "ses_root" })
      writeTask(root, id(2), { threadID: "ses_2", parentID: id(1) })
      writeTask(root, id(3), { threadID: "ses_3", parentID: id(2) })

      //#when the caller caps the walk at one hop
      const found = readSessionTasks({ directory: root, sessionID: "ses_root", ancestryDepth: 1 }).map(
        (t) => t.id,
      )

      //#then only T-1 and T-2 are in scope
      expect(found).toContain(id(2))
      expect(found).not.toContain(id(3))
    })
  })

  test("CYCLE: a parentID cycle terminates, does not throw, and is excluded", () => {
    withTempProject((root) => {
      //#given T-X and T-Y point at each other, with a candidate hanging off the cycle
      writeTask(root, id(1), { threadID: "ses_root" })
      writeTask(root, id(2), { threadID: "ses_x", parentID: id(3) })
      writeTask(root, id(3), { threadID: "ses_y", parentID: id(2) })
      writeTask(root, id(4), { threadID: "ses_z", parentID: id(2) })

      //#when the walk runs over the cyclic store (a non-terminating walk would hang here)
      const found = readSessionTasks({ directory: root, sessionID: "ses_root" }).map((t) => t.id)

      //#then it returned, threw nothing, and the off-cycle candidate is not in scope
      expect(found).toEqual([id(1)])
    })
  })

  test("CYCLE: a self-referential parentID terminates instead of hanging", () => {
    withTempProject((root) => {
      //#given a task that is its own parent
      writeTask(root, id(1), { threadID: "ses_root" })
      writeTask(root, id(2), { threadID: "ses_self", parentID: id(2) })

      //#when the walk runs
      const found = readSessionTasks({ directory: root, sessionID: "ses_root" }).map((t) => t.id)

      //#then only the in-scope root is returned
      expect(found).toEqual([id(1)])
    })
  })

  test("CYCLE: a cycle rooted on an in-scope task resolves to inclusion and still terminates", () => {
    withTempProject((root) => {
      //#given T-1 is in scope and points into a two-node cycle with T-2
      writeTask(root, id(1), { threadID: "ses_root", parentID: id(2) })
      writeTask(root, id(2), { threadID: "ses_child", parentID: id(1) })

      //#when the scope is read
      const found = readSessionTasks({ directory: root, sessionID: "ses_root" }).map((t) => t.id)

      //#then both are in scope — a cycle that reaches a kept node is a real descendant
      expect(found.sort()).toEqual([id(1), id(2)].sort())
    })
  })

  test("a candidate whose parent file does not exist is excluded, without throwing", () => {
    withTempProject((root) => {
      //#given a candidate whose parentID names a task that was never written
      writeTask(root, id(1), { threadID: "ses_root", status: "completed" })
      writeTask(root, id(2), { threadID: "ses_child", parentID: id(9) })

      //#when the scope is read
      const found = readSessionTasks({ directory: root, sessionID: "ses_root" }).map((t) => t.id)

      //#then the walk stops at the unreadable parent and the candidate is not counted
      expect(found).toEqual([id(1)])
    })
  })

  test("a candidate whose parent file fails TaskObjectSchema is excluded, without throwing", () => {
    withTempProject((root) => {
      //#given a parent file that exists but is missing the required threadID
      writeFileSync(
        taskPath(root, id(9)),
        JSON.stringify({
          id: id(9),
          subject: "broken parent",
          description: "",
          status: "pending",
          blocks: [],
          blockedBy: [],
        }),
      )
      writeTask(root, id(1), { threadID: "ses_root", status: "completed" })
      writeTask(root, id(2), { threadID: "ses_child", parentID: id(9) })

      //#when the scope is read
      const found = readSessionTasks({ directory: root, sessionID: "ses_root" }).map((t) => t.id)

      //#then scope is never widened on a file that cannot be validated
      expect(found).toEqual([id(1)])
    })
  })

  test("LIVELOCK FENCE: an unrelated session's task is still excluded from this session's scope", () => {
    withTempProject((root) => {
      //#given a project task from a foreign session with no parentID, plus an unrelated branch
      writeTask(root, id(1), { threadID: "ses_root", status: "completed" })
      writeTask(root, id(2), { threadID: "ses_unrelated" })
      writeTask(root, id(3), { threadID: "ses_unrelated", parentID: id(2) })

      //#when the root session's gate is evaluated
      const pending = hasIncompleteTasksForSession({ directory: root, sessionID: "ses_root" })

      //#then ancestry widens by the parent chain ONLY — never by "same project"
      expect(pending).toBe(false)
      const found = readSessionTasks({ directory: root, sessionID: "ses_root" }).map((t) => t.id)
      expect(found).toEqual([id(1)])
    })
  })

  test("a stale ancestor-side candidate is dropped by the same freshness rule as a direct one", () => {
    withTempProject((root) => {
      //#given an in-scope root plus a child whose file has not been touched for 72h
      writeTask(root, id(1), { threadID: "ses_root", status: "completed" })
      ageFile(writeTask(root, id(2), { threadID: "ses_child", parentID: id(1) }), 72)

      //#when the gate is evaluated with the default 24h staleness window
      const pending = hasIncompleteTasksForSession({ directory: root, sessionID: "ses_root" })

      //#then a dead delegated worker cannot leak a pending handle
      expect(pending).toBe(false)
    })
  })
})

describe("staleAfterMs override", () => {
  test("an explicit staleAfterMs overrides the config-derived 24h window", () => {
    withTempProject((root) => {
      //#given a session task aged 3h — fresh under a 24h default, stale under a 1h override
      ageFile(writeTask(root, id(1), { threadID: "ses_root" }), 3)

      //#when the query supplies a 1h staleAfterMs
      const narrowed = readSessionTasks({ directory: root, sessionID: "ses_root", staleAfterMs: 60 * 60 * 1000 })
      //#and a very large one
      const widened = readSessionTasks({ directory: root, sessionID: "ses_root", staleAfterMs: 48 * 60 * 60 * 1000 })

      //#then the override wins over getStaleAfterMs(config) in both directions
      expect(narrowed).toEqual([])
      expect(widened.map((t) => t.id)).toEqual([id(1)])
    })
  })

  test("the override also bounds the stale test applied to ancestry-expanded tasks", () => {
    withTempProject((root) => {
      //#given a completed root and a 3h-old grandchild reachable through the parent chain
      writeTask(root, id(1), { threadID: "ses_root", status: "completed" })
      writeTask(root, id(2), { threadID: "ses_child", parentID: id(1), status: "completed" })
      ageFile(writeTask(root, id(3), { threadID: "ses_grandchild", parentID: id(2) }), 3)

      //#when the gate runs with a 1h window
      const pending = hasIncompleteTasksForSession({
        directory: root,
        sessionID: "ses_root",
        staleAfterMs: 60 * 60 * 1000,
      })

      //#then the expanded-but-stale grandchild does not hold the gate open
      expect(pending).toBe(false)
    })
  })
})
