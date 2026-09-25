/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import type { Task } from "../../../src/features/task-storage/types"
import { dropSubtasksWithResolvedParent, filterTasksBySession } from "../../../src/hooks/task-continuation-enforcer/todo"

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "T-test",
    subject: "test",
    description: "d",
    status: "pending",
    blocks: [],
    blockedBy: [],
    ...overrides,
  }
}

describe("dropSubtasksWithResolvedParent", () => {
  test("drops subtask when parent is completed", () => {
    //#given
    const tasks = [
      makeTask({ id: "T-parent", status: "completed" }),
      makeTask({ id: "T-child", parentID: "T-parent" }),
    ]
    //#when
    const result = dropSubtasksWithResolvedParent(tasks)
    //#then
    expect(result.map((t) => t.id)).toEqual(["T-parent"])
  })

  test("drops subtask when parent is deleted", () => {
    //#given
    const tasks = [
      makeTask({ id: "T-parent", status: "deleted" }),
      makeTask({ id: "T-child", parentID: "T-parent" }),
    ]
    //#when
    const result = dropSubtasksWithResolvedParent(tasks)
    //#then
    expect(result.map((t) => t.id)).toEqual(["T-parent"])
  })

  test("keeps subtask when parent is in_progress", () => {
    //#given
    const tasks = [
      makeTask({ id: "T-parent", status: "in_progress" }),
      makeTask({ id: "T-child", parentID: "T-parent" }),
    ]
    //#when
    const result = dropSubtasksWithResolvedParent(tasks)
    //#then
    expect(result).toHaveLength(2)
  })

  test("keeps task without parentID", () => {
    //#given
    const tasks = [makeTask({ id: "T-orphan" })]
    //#when
    const result = dropSubtasksWithResolvedParent(tasks)
    //#then
    expect(result).toHaveLength(1)
  })

  test("keeps subtask when parent is missing", () => {
    //#given
    const tasks = [makeTask({ id: "T-child", parentID: "T-missing" })]
    //#when
    const result = dropSubtasksWithResolvedParent(tasks)
    //#then
    expect(result).toHaveLength(1)
  })
})

describe("filterTasksBySession", () => {
  test("sessionScoped=false passes all tasks through", () => {
    //#given
    const tasks = [
      makeTask({ threadID: "other-session" }),
      makeTask({ id: "T-other", threadID: "another" }),
    ]
    //#when
    const result = filterTasksBySession(tasks, { sessionID: "my-session", subagentIDs: [], sessionScoped: false })
    //#then
    expect(result).toHaveLength(2)
  })

  test("pre-migration tasks (no threadID) are included", () => {
    //#given
    const tasks = [makeTask({ threadID: undefined })]
    //#when
    const result = filterTasksBySession(tasks, { sessionID: "my-session", subagentIDs: [] })
    //#then
    expect(result).toHaveLength(1)
  })

  test("current session tasks are included", () => {
    //#given
    const tasks = [makeTask({ threadID: "my-session" })]
    //#when
    const result = filterTasksBySession(tasks, { sessionID: "my-session", subagentIDs: [] })
    //#then
    expect(result).toHaveLength(1)
  })

  test("subagent session tasks are included", () => {
    //#given
    const tasks = [makeTask({ threadID: "sub-1" })]
    //#when
    const result = filterTasksBySession(tasks, { sessionID: "my-session", subagentIDs: ["sub-1", "sub-2"] })
    //#then
    expect(result).toHaveLength(1)
  })

  test("other session tasks are excluded", () => {
    //#given
    const tasks = [makeTask({ threadID: "other-session" })]
    //#when
    const result = filterTasksBySession(tasks, { sessionID: "my-session", subagentIDs: [] })
    //#then
    expect(result).toHaveLength(0)
  })
})