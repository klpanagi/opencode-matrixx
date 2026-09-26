/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import type { BackgroundManager } from "../../../src/features/background-agent"
import type { BackgroundTask, BackgroundTaskStatus } from "../../../src/features/background-agent/types"
import { createBackgroundCancel } from "../../../src/tools/background-task/create-background-cancel"
import { createBackgroundOutput } from "../../../src/tools/background-task/create-background-output"
import type {
  BackgroundCancelClient,
  BackgroundOutputClient,
  BackgroundOutputManager,
} from "../../../src/tools/background-task/tools"
import { formatTaskStatus } from "../../../src/tools/background-task/task-status-format"

const ALL_STATUSES: BackgroundTaskStatus[] = [
  "pending",
  "running",
  "completed",
  "error",
  "cancelled",
  "interrupt",
  "stopped",
  "statusUncertain",
]

const mockContext: ToolContext = {
  sessionID: "test-session",
  messageID: "test-message",
  agent: "test-agent",
  abort: new AbortController().signal,
}

function createTask(overrides: Partial<BackgroundTask> = {}): BackgroundTask {
  return {
    id: "task-1",
    sessionID: "ses-1",
    parentSessionID: "main-1",
    parentMessageID: "msg-1",
    description: "background task",
    prompt: "do work",
    agent: "test-agent",
    status: "running",
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
    completedAt: new Date("2026-01-01T00:00:05.000Z"),
    ...overrides,
  }
}

function createMockManager(task: BackgroundTask): BackgroundOutputManager {
  return {
    getTask: (id: string) => (id === task.id ? task : undefined),
  }
}

function createMockClient(): BackgroundOutputClient {
  return {
    session: {
      messages: async () => ({ data: [] }),
    },
  }
}

describe("formatTaskStatus status notes", () => {
  test("renders each of the 8 statuses in its own status field", () => {
    for (const status of ALL_STATUSES) {
      //#given a task for every member of the widened status union
      //#when formatting the task status block
      const output = formatTaskStatus(createTask({ status }))

      //#then the status renders verbatim, never collapsed into a sibling
      expect(output).toContain(`| Status | **${status}** |`)
    }
  })

  test("stopped renders a Stopped note with partial-output guidance", () => {
    //#given a task whose session ended without a terminal result
    //#when formatting the status block
    const output = formatTaskStatus(createTask({ status: "stopped" }))

    //#then the note explains the outcome and that partial output may exist
    expect(output).toContain("**Stopped**")
    expect(output).toContain("session ended without a terminal result")
    expect(output).toContain("partial output may exist")
  })

  test("statusUncertain renders an Uncertain note with re-check guidance", () => {
    //#given a task whose liveness could not be determined after restart
    //#when formatting the status block
    const output = formatTaskStatus(createTask({ status: "statusUncertain" }))

    //#then the note avoids claiming completion and points at background_output
    expect(output).toContain("**Uncertain**")
    expect(output).toContain("liveness could not be determined after restart")
    expect(output).toContain("background_output")
    expect(output).not.toContain("COMPLETED")
  })

  test("stopped and statusUncertain are never described as Cancelled", () => {
    //#given the two new terminal statuses
    for (const status of ["stopped", "statusUncertain"] as const) {
      //#when formatting each status block
      const output = formatTaskStatus(createTask({ status }))

      //#then neither is bucketed into the cancelled wording
      expect(output).not.toContain("Cancelled")
    }
  })

  test("stopped and statusUncertain report the started->completed duration", () => {
    //#given terminal tasks that started and completed 5s apart
    for (const status of ["stopped", "statusUncertain"] as const) {
      //#when formatting each status block
      const output = formatTaskStatus(createTask({ status }))

      //#then the duration path is used instead of N/A
      expect(output).toContain("| Duration | 5s |")
      expect(output).not.toContain("N/A")
    }
  })
})
describe("background_output terminal routing", () => {
  for (const status of ["stopped", "statusUncertain"] as const) {
    test(`routes ${status} to the status block instead of the session dump`, async () => {
      //#given a terminal task that is neither active nor completed
      const task = createTask({ status })
      const tool = createBackgroundOutput(createMockManager(task), createMockClient())

      //#when retrieving output without full_session
      const output = await tool.execute({ task_id: task.id }, mockContext).then((__r) => __r.content)

      //#then the status block is returned, never a full session dump
      expect(output).toContain("# Task Status")
      expect(output).not.toContain("# Full Session Output")
    })
  }

  test("keeps full-session default for active statuses", async () => {
    //#given a still-running task
    const task = createTask({ status: "running" })
    const tool = createBackgroundOutput(createMockManager(task), createMockClient())

    //#when retrieving output without full_session
    const output = await tool.execute({ task_id: task.id }, mockContext).then((__r) => __r.content)

    //#then active tasks still default to the full session view
    expect(output).toContain("# Full Session Output")
  })
})

describe("background_cancel rejects new terminal statuses", () => {
  for (const status of ["stopped", "statusUncertain"] as const) {
    test(`refuses to cancel a ${status} task`, async () => {
      //#given a task already in a terminal state
      const task = createTask({ status })
      let cancelCalled = false
      const manager = {
        getTask: (id: string) => (id === task.id ? task : undefined),
        getAllDescendantTasks: () => [task],
        cancelTask: async () => {
          cancelCalled = true
          return true
        },
      } as unknown as BackgroundManager
      const client = { session: { abort: async () => ({}) } } as BackgroundCancelClient
      const tool = createBackgroundCancel(manager, client)

      //#when requesting cancellation
      const output = await tool.execute({ taskId: task.id }, mockContext).then((__r) => __r.content)

      //#then the task is refused and cancelTask is never invoked
      expect(output).toContain("Cannot cancel task")
      expect(cancelCalled).toBe(false)
    })
  }

  test("does not include terminal statuses in cancel-all", async () => {
    //#given only stopped/statusUncertain descendants
    const stopped = createTask({ id: "task-stopped", status: "stopped" })
    const uncertain = createTask({ id: "task-uncertain", status: "statusUncertain" })
    let cancelCalled = false
    const manager = {
      getTask: () => undefined,
      getAllDescendantTasks: () => [stopped, uncertain],
      cancelTask: async () => {
        cancelCalled = true
        return true
      },
    } as unknown as BackgroundManager
    const client = { session: { abort: async () => ({}) } } as BackgroundCancelClient
    const tool = createBackgroundCancel(manager, client)

    //#when cancelling all
    const output = await tool.execute({ all: true }, mockContext).then((__r) => __r.content)

    //#then nothing is cancellable and cancelTask is never invoked
    expect(output).toContain("No running or pending background tasks to cancel")
    expect(cancelCalled).toBe(false)
  })
})
