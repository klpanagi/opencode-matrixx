import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { _resetForTesting as resetSessionState } from "../../features/session-state/state"
import type { Task } from "../../features/task-storage/types"
import {
  _resetForTesting,
  _setWriterForTesting,
  syncAllTasksToTodos,
  syncTaskTodoUpdate,
  syncTaskToTodo,
} from "./todo-sync"

type TodoInfo = {
  id?: string
  content: string
  status: "pending" | "in_progress" | "completed" | "cancelled"
  priority?: "low" | "medium" | "high"
}

function makeTask(overrides: Partial<Task> & { id: string; subject: string }): Task {
  return {
    description: "",
    status: "pending",
    blocks: [],
    blockedBy: [],
    ...overrides,
  }
}

function createMockCtx(existingTodos: TodoInfo[] = []) {
  const todoFn = mock(async (_args: unknown) => ({ data: existingTodos }))
  const ctx = {
    client: {
      session: {
        todo: todoFn,
      },
    },
  }
  return { ctx: ctx as unknown as import("@opencode-ai/plugin").PluginInput, todoFn }
}

function createWriterMock() {
  const calls: { sessionID: string; todos: TodoInfo[] }[] = []
  const fn = mock(async (input: { sessionID: string; todos: TodoInfo[] }) => {
    calls.push(input)
  })
  return { fn: fn as unknown as (input: { sessionID: string; todos: TodoInfo[] }) => Promise<void>, calls, mockFn: fn }
}

beforeEach(() => {
  _resetForTesting()
  resetSessionState()
})

afterEach(() => {
  _resetForTesting()
  resetSessionState()
})

describe("syncTaskToTodo", () => {
  test("maps pending to pending", () => {
    //#given a pending task
    const task = makeTask({ id: "T-1", subject: "Do work", status: "pending" })
    //#when converting
    const todo = syncTaskToTodo(task)
    //#then status is pending and content equals subject
    expect(todo?.status).toBe("pending")
    expect(todo?.content).toBe("Do work")
    expect(todo?.id).toBe("T-1")
  })

  test("maps in_progress correctly", () => {
    //#given
    const task = makeTask({ id: "T-2", subject: "Working", status: "in_progress" })
    //#when
    const todo = syncTaskToTodo(task)
    //#then
    expect(todo?.status).toBe("in_progress")
  })

  test("maps completed correctly", () => {
    //#given
    const task = makeTask({ id: "T-3", subject: "Done", status: "completed" })
    //#when
    const todo = syncTaskToTodo(task)
    //#then
    expect(todo?.status).toBe("completed")
  })

  test("deleted maps to null", () => {
    //#given a deleted task
    const task = makeTask({ id: "T-4", subject: "Gone", status: "deleted" })
    //#when
    const todo = syncTaskToTodo(task)
    //#then
    expect(todo).toBeNull()
  })

  test("priority extracted from metadata", () => {
    //#given task with high priority
    const task = makeTask({ id: "T-5", subject: "Urgent", status: "pending", metadata: { priority: "high" } } as unknown as Partial<Task> & { id: string; subject: string })
    //#when
    const todo = syncTaskToTodo(task)
    //#then
    expect(todo?.priority).toBe("high")
  })

  test("invalid priority ignored", () => {
    //#given task with invalid priority
    const task = makeTask({ id: "T-6", subject: "Weird", status: "pending", metadata: { priority: "urgent" } } as unknown as Partial<Task> & { id: string; subject: string })
    //#when
    const todo = syncTaskToTodo(task)
    //#then
    expect(todo?.priority).toBeUndefined()
  })
})

describe("syncTaskTodoUpdate — pure API via injected writer", () => {
  test("happy path calls writer with correct TodoInfo", async () => {
    //#given a task and empty existing todos
    const task = makeTask({ id: "T-10", subject: "Write tests", status: "pending", metadata: { priority: "medium" } } as unknown as Partial<Task> & { id: string; subject: string })
    const { ctx } = createMockCtx([])
    const { fn, calls } = createWriterMock()
    //#when syncing via injected writer
    await syncTaskTodoUpdate(ctx, task, "sess-abc", fn)
    //#then writer called once with correct shape
    expect(calls.length).toBe(1)
    expect(calls[0].sessionID).toBe("sess-abc")
    expect(calls[0].todos.length).toBe(1)
    expect(calls[0].todos[0].content).toBe("Write tests")
    expect(calls[0].todos[0].status).toBe("pending")
    expect(calls[0].todos[0].priority).toBe("medium")
    expect(calls[0].todos[0].id).toBe("T-10")
  })

  test("deleted task filtered from replacement list", async () => {
    //#given existing todo for the deleted task
    const existing: TodoInfo[] = [{ id: "T-20", content: "Old task", status: "pending" }]
    const { ctx } = createMockCtx(existing)
    const { fn, calls } = createWriterMock()
    const deletedTask = makeTask({ id: "T-20", subject: "Old task", status: "deleted" })
    //#when syncing deleted task
    await syncTaskTodoUpdate(ctx, deletedTask, "sess-del", fn)
    //#then writer receives empty list (filtered)
    expect(calls.length).toBe(1)
    expect(calls[0].todos.length).toBe(0)
  })

  test("deleted via content match when id missing", async () => {
    //#given existing todo without id but matching content
    const existing: TodoInfo[] = [{ content: "Orphan", status: "pending" }]
    const { ctx } = createMockCtx(existing)
    const { fn, calls } = createWriterMock()
    const deletedTask = makeTask({ id: "T-99", subject: "Orphan", status: "deleted" })
    //#when
    await syncTaskTodoUpdate(ctx, deletedTask, "sess-orphan", fn)
    //#then todo with matching content removed
    expect(calls[0].todos.length).toBe(0)
  })

  test("empty sessionID does not call writer", async () => {
    //#given empty sessionID
    const task = makeTask({ id: "T-30", subject: "No session", status: "pending" })
    const { ctx, todoFn } = createMockCtx([])
    const { fn, calls } = createWriterMock()
    //#when syncing with empty string
    await syncTaskTodoUpdate(ctx, task, "", fn)
    //#then writer not called and todo GET not called
    expect(calls.length).toBe(0)
    expect(todoFn).not.toHaveBeenCalled()
  })

  test("whitespace sessionID does not call writer", async () => {
    //#given whitespace sessionID
    const task = makeTask({ id: "T-31", subject: "Space session", status: "pending" })
    const { ctx, todoFn } = createMockCtx([])
    const { fn, calls } = createWriterMock()
    //#when
    await syncTaskTodoUpdate(ctx, task, "   ", fn)
    //#then
    expect(calls.length).toBe(0)
    expect(todoFn).not.toHaveBeenCalled()
  })

  test("undefined ctx does not call writer", async () => {
    //#given undefined ctx
    const task = makeTask({ id: "T-32", subject: "No ctx", status: "pending" })
    const { fn, calls } = createWriterMock()
    //#when
    await syncTaskTodoUpdate(undefined, task, "sess-xyz", fn)
    //#then
    expect(calls.length).toBe(0)
  })

  test("writer null fails visibly — no DB fallback, no throw to caller", async () => {
    //#given writer is null (via global injection)
    _setWriterForTesting(null)
    const task = makeTask({ id: "T-40", subject: "Fails", status: "pending" })
    const { ctx } = createMockCtx([])
    //#when calling without injected writer (relies on global null)
    let threw = false
    try {
      await syncTaskTodoUpdate(ctx, task, "sess-null", undefined)
    } catch {
      threw = true
    }
    //#then syncTaskTodoUpdate swallows internally (does not throw) but also did not succeed
    expect(threw).toBe(false)
  })

  test("empty todos list still publishes via writer with []", async () => {
    //#given deleted task where result is empty
    const existing: TodoInfo[] = [{ id: "T-50", content: "Last", status: "pending" }]
    const { ctx } = createMockCtx(existing)
    const { fn, calls } = createWriterMock()
    const deleted = makeTask({ id: "T-50", subject: "Last", status: "deleted" })
    //#when
    await syncTaskTodoUpdate(ctx, deleted, "sess-empty", fn)
    //#then writer called with empty array (publish empty to clear)
    expect(calls[0].todos).toEqual([])
  })

  test("resolveTodoWriter retry after null then mock succeeds", async () => {
    //#given first call with null writer fails, second with mock succeeds
    _setWriterForTesting(null)
    const task1 = makeTask({ id: "T-60", subject: "Retry 1", status: "pending" })
    const { ctx: ctx1 } = createMockCtx([])
    await syncTaskTodoUpdate(ctx1, task1, "sess-retry", undefined)
    //#when setting mock writer and retrying
    const { fn, calls } = createWriterMock()
    _setWriterForTesting(fn)
    const task2 = makeTask({ id: "T-61", subject: "Retry 2", status: "pending" })
    const { ctx: ctx2 } = createMockCtx([])
    await syncTaskTodoUpdate(ctx2, task2, "sess-retry", undefined)
    //#then second call used the new writer
    expect(calls.length).toBe(1)
    expect(calls[0].todos[0].content).toBe("Retry 2")
  })

  test("injected writer param bypasses global null", async () => {
    //#given global is null but injected writer is valid
    _setWriterForTesting(null)
    const task = makeTask({ id: "T-70", subject: "Injected wins", status: "pending" })
    const { ctx } = createMockCtx([])
    const { fn, calls } = createWriterMock()
    //#when passing writer explicitly
    await syncTaskTodoUpdate(ctx, task, "sess-inject", fn)
    //#then injected writer used
    expect(calls.length).toBe(1)
    expect(calls[0].todos[0].content).toBe("Injected wins")
  })

  test("writer that throws does not propagate to caller", async () => {
    //#given writer that throws
    const throwingWriter = mock(async () => {
      throw new Error("network failure")
    }) as unknown as (input: { sessionID: string; todos: TodoInfo[] }) => Promise<void>
    const task = makeTask({ id: "T-71", subject: "Thrower", status: "pending" })
    const { ctx } = createMockCtx([])
    //#when
    let threw = false
    try {
      await syncTaskTodoUpdate(ctx, task, "sess-throw", throwingWriter)
    } catch {
      threw = true
    }
    //#then swallowed inside syncSingleSession
    expect(threw).toBe(false)
  })
})

describe("syncAllTasksToTodos — pure API", () => {
  test("mix of pending/completed/deleted produces correct final list", async () => {
    //#given existing todos including one orphan to keep
    const existing: TodoInfo[] = [
      { id: "T-1", content: "Keep pending", status: "pending" },
      { id: "T-del", content: "To delete", status: "pending" },
      { content: "Orphan keep", status: "pending" },
    ]
    const { ctx } = createMockCtx(existing)
    const { fn, calls } = createWriterMock()
    const tasks: Task[] = [
      makeTask({ id: "T-1", subject: "Keep pending", status: "pending" }),
      makeTask({ id: "T-2", subject: "New completed", status: "completed" }),
      makeTask({ id: "T-del", subject: "To delete", status: "deleted" }),
    ]
    //#when syncing all
    await syncAllTasksToTodos(ctx, tasks, "sess-mix", fn)
    //#then visibleTodos contains kept pending and orphan, but not deleted nor completed (filtered for TUI)
    expect(calls.length).toBe(1)
    const contents = calls[0].todos.map((t) => t.content)
    expect(contents).toContain("Keep pending")
    expect(contents).not.toContain("New completed")
    expect(contents).toContain("Orphan keep")
    expect(contents).not.toContain("To delete")
    const deletedStillThere = calls[0].todos.find((t) => t.id === "T-del")
    expect(deletedStillThere).toBeUndefined()
    expect(calls[0].todos.every((t) => t.status !== "completed" && t.status !== "cancelled")).toBe(true)
  })

  test("empty sessionID skips writer", async () => {
    //#given empty sessionID
    const tasks = [makeTask({ id: "T-1", subject: "A", status: "pending" })]
    const { ctx, todoFn } = createMockCtx([])
    const { fn, calls } = createWriterMock()
    //#when
    await syncAllTasksToTodos(ctx, tasks, "", fn)
    //#then
    expect(calls.length).toBe(0)
    expect(todoFn).not.toHaveBeenCalled()
  })

  test("undefined sessionID skips writer", async () => {
    //#given undefined sessionID
    const tasks = [makeTask({ id: "T-1", subject: "A", status: "pending" })]
    const { ctx, todoFn } = createMockCtx([])
    const { fn, calls } = createWriterMock()
    //#when
    await syncAllTasksToTodos(ctx, tasks, undefined, fn)
    //#then
    expect(calls.length).toBe(0)
    expect(todoFn).not.toHaveBeenCalled()
  })

  test("all deleted results in orphan-preserved empty-plus-orphan then writer called", async () => {
    //#given only deleted tasks and empty existing
    const { ctx } = createMockCtx([])
    const { fn, calls } = createWriterMock()
    const tasks = [makeTask({ id: "T-x", subject: "Gone", status: "deleted" })]
    //#when
    await syncAllTasksToTodos(ctx, tasks, "sess-all-del", fn)
    //#then writer called with empty list (no newTodos)
    expect(calls.length).toBe(1)
    expect(calls[0].todos.length).toBe(0)
  })

  test("response without data wrapper handled", async () => {
    //#given ctx returns array directly
    const todoFn = mock(async () => [{ content: "Direct", status: "pending" }] as unknown as TodoInfo[])
    const ctx = { client: { session: { todo: todoFn } } } as unknown as import("@opencode-ai/plugin").PluginInput
    const { fn, calls } = createWriterMock()
    const tasks = [makeTask({ id: "T-a", subject: "New", status: "pending" })]
    //#when
    await syncAllTasksToTodos(ctx, tasks, "sess-direct", fn)
    //#then still syncs correctly, preserving non-matching direct todo
    expect(calls.length).toBe(1)
    expect(calls[0].todos.some((t) => t.content === "Direct")).toBe(true)
  })

  test("writer null via injection handles visibly without success", async () => {
    //#given global writer null and no injected writer
    _setWriterForTesting(null)
    const { ctx } = createMockCtx([])
    const tasks = [makeTask({ id: "T-1", subject: "A", status: "pending" })]
    //#when
    let threw = false
    try {
      await syncAllTasksToTodos(ctx, tasks, "sess-null-all", undefined)
    } catch {
      threw = true
    }
    //#then swallowed inside (not propagated), but did not write successfully
    expect(threw).toBe(false)
  })

  test("retry after null via _setWriterForTesting", async () => {
    //#given null then mock
    _setWriterForTesting(null)
    const { ctx: ctx1 } = createMockCtx([])
    await syncAllTasksToTodos(ctx1, [makeTask({ id: "T-1", subject: "A", status: "pending" })], "sess-retry-all", undefined)
    //#when setting writer and retrying
    const { fn, calls } = createWriterMock()
    _setWriterForTesting(fn)
    const { ctx: ctx2 } = createMockCtx([])
    await syncAllTasksToTodos(ctx2, [makeTask({ id: "T-2", subject: "B", status: "pending" })], "sess-retry-all", undefined)
    //#then second call succeeds
    expect(calls.length).toBe(1)
    expect(calls[0].todos[0].content).toBe("B")
  })
})
