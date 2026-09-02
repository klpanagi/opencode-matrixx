/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { getMainSessionID, setMainSession } from "../../../src/features/session-state/state"
import type { Task } from "../../../src/features/task-storage/types"
import {
  syncAllTasksToTodos,
  syncTaskTodoUpdate,
  syncTaskToTodo,
  type TodoInfo,
} from "../../../src/tools/task/todo-sync"
import type { PluginInput } from "@opencode-ai/plugin"

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "T-1",
    subject: "Test task",
    description: "description",
    status: "pending",
    blocks: [],
    blockedBy: [],
    ...overrides,
  }
}

function makeCtx(todoData: TodoInfo[] | unknown = []): PluginInput {
  const todoMock = mock(() => {
    if (Array.isArray(todoData)) {
      return Promise.resolve({ data: todoData } as unknown)
    }
    return Promise.resolve(todoData as unknown)
  })
  return {
    client: {
      session: {
        todo: todoMock as unknown as PluginInput["client"]["session"]["todo"],
      },
    },
  } as unknown as PluginInput
}

function writerSpy() {
  const calls: Array<{ sessionID: string; todos: TodoInfo[] }> = []
  const fn = mock(async (input: { sessionID: string; todos: TodoInfo[] }) => {
    calls.push(input)
  })
  return { fn, calls }
}

// ---------------------------------------------------------------------------
// syncTaskToTodo — pure mapping
// ---------------------------------------------------------------------------

describe("syncTaskToTodo", () => {
  test("converts pending task to pending todo", () => {
    //#given
    const task = makeTask({ id: "T-123", subject: "Fix bug", status: "pending" })

    //#when
    const result = syncTaskToTodo(task)

    //#then
    expect(result).toEqual({ id: "T-123", content: "Fix bug", status: "pending", priority: undefined })
  })

  test("converts in_progress task to in_progress todo", () => {
    //#given
    const task = makeTask({ id: "T-456", subject: "Implement feature", status: "in_progress" })

    //#when
    const result = syncTaskToTodo(task)

    //#then
    expect(result?.status).toBe("in_progress")
    expect(result?.content).toBe("Implement feature")
  })

  test("converts completed task to completed todo", () => {
    //#given
    const task = makeTask({ id: "T-789", subject: "Review PR", status: "completed" })

    //#when
    const result = syncTaskToTodo(task)

    //#then
    expect(result?.status).toBe("completed")
  })

  test("returns null for deleted task", () => {
    //#given
    const task = makeTask({ id: "T-del", subject: "Deleted task", status: "deleted" })

    //#when
    const result = syncTaskToTodo(task)

    //#then
    expect(result).toBeNull()
  })

  test("extracts high priority from metadata", () => {
    //#given
    const task = makeTask({ id: "T-high", subject: "Critical task", metadata: { priority: "high" } })

    //#when
    const result = syncTaskToTodo(task)

    //#then
    expect(result?.priority).toBe("high")
  })

  test("handles medium priority", () => {
    //#given
    const task = makeTask({ id: "T-med", subject: "Medium task", metadata: { priority: "medium" } })

    //#when
    const result = syncTaskToTodo(task)

    //#then
    expect(result?.priority).toBe("medium")
  })

  test("handles low priority", () => {
    //#given
    const task = makeTask({ id: "T-low", subject: "Low task", metadata: { priority: "low" } })

    //#when
    const result = syncTaskToTodo(task)

    //#then
    expect(result?.priority).toBe("low")
  })

  test("ignores invalid priority values", () => {
    //#given
    const task = makeTask({ id: "T-invalid", subject: "Invalid", metadata: { priority: "urgent" } })

    //#when
    const result = syncTaskToTodo(task)

    //#then
    expect(result?.priority).toBeUndefined()
  })

  test("handles missing metadata", () => {
    //#given
    const task = makeTask({ id: "T-no-meta", subject: "No metadata" })

    //#when
    const result = syncTaskToTodo(task)

    //#then
    expect(result?.priority).toBeUndefined()
  })

  test("uses subject as todo content", () => {
    //#given
    const task = makeTask({ id: "T-content", subject: "This is the subject", description: "desc" })

    //#when
    const result = syncTaskToTodo(task)

    //#then
    expect(result?.content).toBe("This is the subject")
  })

  test("handles numeric priority as invalid", () => {
    //#given
    const task = makeTask({
      id: "T-num",
      subject: "x",
      metadata: { priority: 123 as unknown as string },
    })

    //#when
    const result = syncTaskToTodo(task)

    //#then
    expect(result?.priority).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// syncTaskTodoUpdate — single-task sync with dual-write
// ---------------------------------------------------------------------------

describe("syncTaskTodoUpdate", () => {
  afterEach(() => {
    setMainSession(undefined)
  })

  test("no-ops when ctx is undefined", async () => {
    //#given
    const task = makeTask()
    const writer = writerSpy()

    //#when
    await syncTaskTodoUpdate(undefined, task, "ses-1", writer.fn)

    //#then
    expect(writer.calls.length).toBe(0)
  })

  test("writes updated todo and preserves existing items", async () => {
    //#given
    const task = makeTask({ id: "T-1", subject: "Updated task", status: "in_progress" })
    const currentTodos: TodoInfo[] = [
      { id: "T-1", content: "Old task", status: "pending" },
      { id: "T-2", content: "Keep task", status: "pending" },
    ]
    const ctx = makeCtx(currentTodos)
    const writer = writerSpy()

    //#when
    await syncTaskTodoUpdate(ctx, task, "session-1", writer.fn)

    //#then
    expect(writer.calls.length).toBe(1)
    expect(writer.calls[0].sessionID).toBe("session-1")
    expect(writer.calls[0].todos.length).toBe(2)
    expect(writer.calls[0].todos.find((t) => t.id === "T-1")?.content).toBe("Updated task")
    expect(writer.calls[0].todos.some((t) => t.id === "T-2")).toBe(true)
  })

  test("removes deleted task from todos by id", async () => {
    //#given
    const task = makeTask({ id: "T-1", subject: "Deleted task", status: "deleted" })
    const currentTodos: TodoInfo[] = [
      { id: "T-1", content: "Old task", status: "pending" },
      { id: "T-2", content: "Keep task", status: "pending" },
    ]
    const ctx = makeCtx(currentTodos)
    const writer = writerSpy()

    //#when
    await syncTaskTodoUpdate(ctx, task, "session-1", writer.fn)

    //#then
    expect(writer.calls[0].todos.length).toBe(1)
    expect(writer.calls[0].todos.some((t) => t.id === "T-1")).toBe(false)
    expect(writer.calls[0].todos.some((t) => t.id === "T-2")).toBe(true)
  })

  test("removes deleted task by content when todo has no id", async () => {
    //#given
    const task = makeTask({ id: "T-del", subject: "Gone", status: "deleted" })
    const currentTodos: TodoInfo[] = [
      { content: "Gone", status: "pending" },
      { content: "Keep me", status: "pending" },
    ]
    const ctx = makeCtx(currentTodos)
    const writer = writerSpy()

    //#when
    await syncTaskTodoUpdate(ctx, task, "session-1", writer.fn)

    //#then
    expect(writer.calls[0].todos.length).toBe(1)
    expect(writer.calls[0].todos[0].content).toBe("Keep me")
  })

  test("filters existing todo by content when todo has no id and task has todo", async () => {
    //#given
    const task = makeTask({ id: "T-1", subject: "Updated task", status: "pending" })
    const currentTodos: TodoInfo[] = [
      { content: "Updated task", status: "pending" },
      { content: "Other", status: "pending" },
    ]
    const ctx = makeCtx(currentTodos)
    const writer = writerSpy()

    //#when
    await syncTaskTodoUpdate(ctx, task, "session-1", writer.fn)

    //#then — the no-id todo matching content should be replaced, not duplicated
    const matching = writer.calls[0].todos.filter((t) => t.content === "Updated task")
    expect(matching.length).toBe(1)
    expect(matching[0].id).toBe("T-1")
  })

  test("does not write when writer is null", async () => {
    //#given
    const task = makeTask({ id: "T-1", subject: "x", status: "pending" })
    const ctx = makeCtx([{ id: "T-1", content: "x", status: "pending" }])

    //#when — writer null and resolveTodoWriter returns null in test env
    await syncTaskTodoUpdate(ctx, task, "session-1", null as unknown as undefined)

    //#then — should not throw; fetch still called but no write
    expect(ctx.client.session.todo).toHaveBeenCalled()
  })

  test("dual-writes to caller session and main session when different", async () => {
    //#given
    setMainSession("main-123")
    const task = makeTask({ id: "T-1", subject: "Dual", status: "pending" })
    const ctx = makeCtx([{ id: "T-9", content: "Existing", status: "pending" }])
    const writer = writerSpy()

    //#when
    await syncTaskTodoUpdate(ctx, task, "caller-456", writer.fn)

    //#then
    expect(writer.calls.length).toBe(2)
    expect(writer.calls[0].sessionID).toBe("caller-456")
    expect(writer.calls[1].sessionID).toBe("main-123")
    for (const call of writer.calls) {
      expect(call.todos.some((t) => t.id === "T-1")).toBe(true)
    }
  })

  test("writes only once when caller session equals main session", async () => {
    //#given
    setMainSession("same-id")
    const task = makeTask({ id: "T-1", subject: "Solo", status: "pending" })
    const ctx = makeCtx([])
    const writer = writerSpy()

    //#when
    await syncTaskTodoUpdate(ctx, task, "same-id", writer.fn)

    //#then
    expect(writer.calls.length).toBe(1)
    expect(writer.calls[0].sessionID).toBe("same-id")
  })

  test("writes only once when main session is undefined", async () => {
    //#given
    setMainSession(undefined)
    const task = makeTask({ id: "T-1", subject: "Solo", status: "pending" })
    const ctx = makeCtx([])
    const writer = writerSpy()

    //#when
    await syncTaskTodoUpdate(ctx, task, "caller-1", writer.fn)

    //#then
    expect(writer.calls.length).toBe(1)
    expect(writer.calls[0].sessionID).toBe("caller-1")
  })

  test("fetches twice for dual-write", async () => {
    //#given
    setMainSession("main-1")
    const task = makeTask({ id: "T-1", subject: "Fetch twice", status: "pending" })
    const ctx = makeCtx([])
    const writer = writerSpy()

    //#when
    await syncTaskTodoUpdate(ctx, task, "caller-1", writer.fn)

    //#then
    expect(ctx.client.session.todo).toHaveBeenCalledTimes(2)
    expect(getMainSessionID()).toBe("main-1")
  })

  test("handles fetch failure gracefully without throw", async () => {
    //#given
    const task = makeTask({ id: "T-1", subject: "x", status: "pending" })
    const ctx = {
      client: {
        session: {
          todo: mock(() => Promise.reject(new Error("network error"))),
        },
      },
    } as unknown as PluginInput
    const writer = writerSpy()

    //#when / #then — should not throw
    await expect(syncTaskTodoUpdate(ctx, task, "ses-1", writer.fn)).resolves.toBeUndefined()
  })

  test("handles writer failure gracefully without throw", async () => {
    //#given
    const task = makeTask({ id: "T-1", subject: "x", status: "pending" })
    const ctx = makeCtx([{ id: "T-1", content: "x", status: "pending" }])
    const failingWriter = mock(() => Promise.reject(new Error("writer boom")))

    //#when / #then
    await expect(
      syncTaskTodoUpdate(ctx, task, "ses-1", failingWriter as unknown as typeof writerSpy.prototype.fn),
    ).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// syncAllTasksToTodos — bulk merge
// ---------------------------------------------------------------------------

describe("syncAllTasksToTodos", () => {
  test("fetches current todos from OpenCode", async () => {
    //#given
    const tasks: Task[] = [makeTask({ id: "T-1", subject: "Task 1" })]
    const currentTodos: TodoInfo[] = [{ id: "T-existing", content: "Existing todo", status: "pending" }]
    const ctx = makeCtx(currentTodos)

    //#when
    await syncAllTasksToTodos(ctx, tasks, "session-1")

    //#then
    expect(ctx.client.session.todo).toHaveBeenCalledWith({ path: { id: "session-1" } })
  })

  test("handles API response with data property", async () => {
    //#given
    const tasks: Task[] = []
    const ctx = makeCtx([{ id: "T-1", content: "Todo 1", status: "pending" }])

    //#when
    await syncAllTasksToTodos(ctx, tasks, "session-1")

    //#then
    expect(ctx.client.session.todo).toHaveBeenCalled()
  })

  test("handles raw array response", async () => {
    //#given
    const tasks: Task[] = [makeTask({ id: "T-1", subject: "Task 1" })]
    const ctx = {
      client: {
        session: {
          todo: mock(() => Promise.resolve([{ id: "T-1", content: "Todo 1", status: "pending" }])),
        },
      },
    } as unknown as PluginInput

    //#when
    await syncAllTasksToTodos(ctx, tasks, "session-1")

    //#then
    expect(ctx.client.session.todo).toHaveBeenCalled()
  })

  test("handles null response as empty", async () => {
    //#given
    const tasks: Task[] = [makeTask({ id: "T-1", subject: "Task 1" })]
    const ctx = {
      client: {
        session: {
          todo: mock(() => Promise.resolve(null)),
        },
      },
    } as unknown as PluginInput
    const writer = writerSpy()

    //#when
    await syncAllTasksToTodos(ctx, tasks, "session-1", writer.fn)

    //#then
    expect(writer.calls[0].todos.some((t) => t.content === "Task 1")).toBe(true)
  })

  test("gracefully handles fetch failure", async () => {
    //#given
    const tasks: Task[] = [makeTask({ id: "T-1", subject: "Task 1" })]
    const ctx = {
      client: {
        session: {
          todo: mock(() => Promise.reject(new Error("API error"))),
        },
      },
    } as unknown as PluginInput

    //#when
    const result = await syncAllTasksToTodos(ctx, tasks, "session-1")

    //#then
    expect(result).toBeUndefined()
  })

  test("converts multiple tasks to todos", async () => {
    //#given
    const tasks: Task[] = [
      makeTask({ id: "T-1", subject: "Task 1", metadata: { priority: "high" } }),
      makeTask({ id: "T-2", subject: "Task 2", status: "in_progress", metadata: { priority: "low" } }),
    ]
    const ctx = makeCtx([])
    const writer = writerSpy()

    //#when
    await syncAllTasksToTodos(ctx, tasks, "session-1", writer.fn)

    //#then
    expect(writer.calls[0].todos.length).toBe(2)
    expect(writer.calls[0].todos.find((t) => t.id === "T-1")?.priority).toBe("high")
    expect(writer.calls[0].todos.find((t) => t.id === "T-2")?.status).toBe("in_progress")
  })

  test("removes deleted tasks from todo list by id", async () => {
    //#given
    const tasks: Task[] = [makeTask({ id: "T-1", subject: "Task 1", status: "deleted" })]
    const currentTodos: TodoInfo[] = [{ id: "T-1", content: "Task 1", status: "pending" }]
    const ctx = makeCtx(currentTodos)
    const writer = writerSpy()

    //#when
    await syncAllTasksToTodos(ctx, tasks, "session-1", writer.fn)

    //#then
    expect(writer.calls[0].todos.some((t) => t.id === "T-1")).toBe(false)
  })

  test("removes deleted tasks by content when todo has no id", async () => {
    //#given
    const tasks: Task[] = [makeTask({ id: "T-del", subject: "Gone", status: "deleted" })]
    const currentTodos: TodoInfo[] = [
      { content: "Gone", status: "pending" },
      { content: "Keep", status: "pending" },
    ]
    const ctx = makeCtx(currentTodos)
    const writer = writerSpy()

    //#when
    await syncAllTasksToTodos(ctx, tasks, "session-1", writer.fn)

    //#then
    expect(writer.calls[0].todos.some((t) => t.content === "Gone")).toBe(false)
    expect(writer.calls[0].todos.some((t) => t.content === "Keep")).toBe(true)
  })

  test("preserves existing todos not in task list", async () => {
    //#given
    const tasks: Task[] = [makeTask({ id: "T-1", subject: "Task 1" })]
    const currentTodos: TodoInfo[] = [
      { id: "T-1", content: "Task 1", status: "pending" },
      { id: "T-existing", content: "Existing todo", status: "pending" },
    ]
    const ctx = makeCtx(currentTodos)
    const writer = writerSpy()

    //#when
    await syncAllTasksToTodos(ctx, tasks, "session-1", writer.fn)

    //#then
    expect(writer.calls[0].todos.some((t) => t.id === "T-existing")).toBe(true)
    expect(writer.calls[0].todos.some((t) => t.content === "Task 1")).toBe(true)
  })

  test("handles empty task list", async () => {
    //#given
    const tasks: Task[] = []
    const ctx = makeCtx([])
    const writer = writerSpy()

    //#when
    await syncAllTasksToTodos(ctx, tasks, "session-1", writer.fn)

    //#then
    expect(writer.calls[0].todos.length).toBe(0)
  })

  test("calls writer with final todos", async () => {
    //#given
    const tasks: Task[] = [makeTask({ id: "T-1", subject: "Task 1" })]
    const ctx = makeCtx([])
    const writer = writerSpy()

    //#when
    await syncAllTasksToTodos(ctx, tasks, "session-1", writer.fn)

    //#then
    expect(writer.calls.length).toBe(1)
    expect(writer.calls[0].sessionID).toBe("session-1")
    expect(writer.calls[0].todos[0].content).toBe("Task 1")
  })

  test("does not call writer when sessionID is undefined", async () => {
    //#given
    const tasks: Task[] = [makeTask({ id: "T-1", subject: "Task 1" })]
    const ctx = makeCtx([])
    const writer = writerSpy()

    //#when
    await syncAllTasksToTodos(ctx, tasks, undefined, writer.fn)

    //#then
    expect(writer.calls.length).toBe(0)
  })

  test("does not call writer when writer is undefined and Todo.update unavailable", async () => {
    //#given
    const tasks: Task[] = [makeTask({ id: "T-1", subject: "Task 1" })]
    const ctx = makeCtx([])

    //#when — no writer passed, resolveTodoWriter returns null in test env
    await syncAllTasksToTodos(ctx, tasks, "session-1")

    //#then — should not throw
    expect(ctx.client.session.todo).toHaveBeenCalled()
  })

  test("deduplicates no-id todos when task replaces existing content", async () => {
    //#given
    const tasks: Task[] = [makeTask({ id: "T-1", subject: "Task 1 (updated)", status: "in_progress" })]
    const currentTodos: TodoInfo[] = [{ content: "Task 1 (updated)", status: "pending" }]
    const ctx = makeCtx(currentTodos)
    const writer = writerSpy()

    //#when
    await syncAllTasksToTodos(ctx, tasks, "session-1", writer.fn)

    //#then — no duplicates
    const matching = writer.calls[0].todos.filter((t) => t.content === "Task 1 (updated)")
    expect(matching.length).toBe(1)
    expect(matching[0].status).toBe("in_progress")
  })

  test("preserves unrelated no-id todos", async () => {
    //#given
    const tasks: Task[] = [makeTask({ id: "T-1", subject: "Task 1" })]
    const currentTodos: TodoInfo[] = [
      { id: "T-1", content: "Task 1", status: "pending" },
      { content: "Todo without id", status: "pending" },
    ]
    const ctx = makeCtx(currentTodos)
    const writer = writerSpy()

    //#when
    await syncAllTasksToTodos(ctx, tasks, "session-1", writer.fn)

    //#then — "Todo without id" is unrelated, should be preserved
    expect(writer.calls[0].todos.some((t) => t.content === "Todo without id")).toBe(true)
  })

  test("replaces no-id todo when task subject matches content", async () => {
    //#given
    const tasks: Task[] = [makeTask({ id: "T-99", subject: "Matched", status: "pending" })]
    const currentTodos: TodoInfo[] = [{ content: "Matched", status: "completed" }]
    const ctx = makeCtx(currentTodos)
    const writer = writerSpy()

    //#when
    await syncAllTasksToTodos(ctx, tasks, "session-1", writer.fn)

    //#then — existing no-id "Matched" should be replaced, final has id T-99
    const matched = writer.calls[0].todos.filter((t) => t.content === "Matched")
    expect(matched.length).toBe(1)
    expect(matched[0].id).toBe("T-99")
  })

  test("handles writer throwing", async () => {
    //#given
    const tasks: Task[] = [makeTask({ id: "T-1", subject: "Task 1" })]
    const ctx = makeCtx([])
    const failingWriter = mock(() => Promise.reject(new Error("writer fail")))

    //#when / #then — should not throw
    await expect(
      syncAllTasksToTodos(ctx, tasks, "session-1", failingWriter as unknown as typeof writerSpy.prototype.fn),
    ).resolves.toBeUndefined()
  })

  test("filters no-id existing todos whose content equals any task subject", async () => {
    //#given
    const tasks: Task[] = [makeTask({ id: "T-1", subject: "Alpha", status: "pending" })]
    const currentTodos: TodoInfo[] = [
      { content: "Alpha", status: "pending" },
      { content: "Beta", status: "pending" },
    ]
    const ctx = makeCtx(currentTodos)
    const writer = writerSpy()

    //#when
    await syncAllTasksToTodos(ctx, tasks, "session-1", writer.fn)

    //#then — Alpha no-id replaced, Beta preserved
    expect(writer.calls[0].todos.filter((t) => t.content === "Alpha").length).toBe(1)
    expect(writer.calls[0].todos.some((t) => t.content === "Beta")).toBe(true)
  })
})
