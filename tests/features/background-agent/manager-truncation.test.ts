const { describe, test, expect, beforeEach, afterEach } = require("bun:test")
const { mock } = require("bun:test")

import { tmpdir } from "node:os"
import type { PluginInput } from "@opencode-ai/plugin"
import { BackgroundManager } from "../../../src/features/background-agent/manager"
import type { BackgroundTask } from "../../../src/features/background-agent/types"
import type { DcpHandoffCompression } from "../../../src/config/schema"

const DEFAULT_HANDOFF_COMPRESSION: DcpHandoffCompression = {
  enabled: true,
  maxMessages: 6,
  keepFirst: 2,
  keepLast: 3,
}

function createManagerWithCompression(
  client: Record<string, unknown>,
  compression?: DcpHandoffCompression,
): BackgroundManager {
  return new BackgroundManager(
    { client, directory: tmpdir() } as unknown as PluginInput,
    undefined,
    { handoffCompression: compression ?? DEFAULT_HANDOFF_COMPRESSION } as Record<string, unknown>,
  )
}

// Reuse helpers from manager.test.ts pattern
function getTaskMap(manager: BackgroundManager): Map<string, BackgroundTask> {
  return (manager as unknown as { tasks: Map<string, BackgroundTask> }).tasks
}

function getPendingByParent(manager: BackgroundManager): Map<string, Set<string>> {
  return (manager as unknown as { pendingByParent: Map<string, Set<string>> }).pendingByParent
}

async function tryCompleteTaskForTest(manager: BackgroundManager, task: BackgroundTask): Promise<boolean> {
  return (manager as unknown as { tryCompleteTask: (task: BackgroundTask, source: string) => Promise<boolean> })
    .tryCompleteTask(task, "test")
}

function stubNotifyParentSession(manager: BackgroundManager): void {
  ;(manager as unknown as { notifyParentSession: () => Promise<void> }).notifyParentSession = async () => {}
}

function createMockTask(overrides: Partial<BackgroundTask> & { id: string; sessionID: string; parentSessionID: string }): BackgroundTask {
  return {
    parentMessageID: "mock-message-id",
    description: "test task",
    prompt: "test prompt",
    agent: "test-agent",
    status: "running",
    startedAt: new Date(),
    ...overrides,
  }
}

function makeAssistantMessage(text: string) {
  return {
    info: { role: "assistant" },
    parts: [{ type: "text", text }],
  }
}

function makeUserMessage(text: string) {
  return {
    info: { role: "user" },
    parts: [{ type: "text", text }],
  }
}

describe("BackgroundManager.tryCompleteTask - handoff compression", () => {
  afterEach(() => {
    mock.restore()
  })

  test("should skip compression when task has no sessionID", async () => {
    // given
    const client = {
      session: {
        prompt: async () => ({}),
        promptAsync: async () => ({}),
        abort: async () => ({}),
        messages: async () => {
          throw new Error("should not be called")
        },
      },
    }
    const manager = createManagerWithCompression(client)
    stubNotifyParentSession(manager)

    const task = createMockTask({
      id: "task-no-session",
      sessionID: undefined as unknown as string,
      parentSessionID: "parent-session",
      status: "running",
    })

    // when
    const completed = await tryCompleteTaskForTest(manager, task)

    // then
    expect(completed).toBe(true)
    expect(task.status).toBe("completed")
    expect((task as BackgroundTask & { compactedResult?: string }).compactedResult).toBeUndefined()

    manager.shutdown()
  })

  test("should skip compression when handoffCompression is disabled", async () => {
    // given
    const client = {
      session: {
        prompt: async () => ({}),
        promptAsync: async () => ({}),
        abort: async () => ({}),
        messages: async () => {
          throw new Error("should not be called")
        },
      },
    }
    const disabledCompression: DcpHandoffCompression = {
      enabled: false,
      maxMessages: 6,
      keepFirst: 2,
      keepLast: 3,
    }
    const manager = createManagerWithCompression(client, disabledCompression)
    stubNotifyParentSession(manager)

    const task = createMockTask({
      id: "task-disabled",
      sessionID: "session-disabled",
      parentSessionID: "parent-session",
      status: "running",
    })

    // when
    const completed = await tryCompleteTaskForTest(manager, task)

    // then
    expect(completed).toBe(true)
    expect(task.status).toBe("completed")
    expect((task as BackgroundTask & { compactedResult?: string }).compactedResult).toBeUndefined()

    manager.shutdown()
  })

  test("should NOT truncate when assistant messages <= maxMessages (6)", async () => {
    // given
    const client = {
      session: {
        prompt: async () => ({}),
        promptAsync: async () => ({}),
        abort: async () => ({}),
        messages: async () => ({
          data: [
            makeUserMessage("user 1"),
            makeAssistantMessage("assistant 1"),
            makeUserMessage("user 2"),
            makeAssistantMessage("assistant 2"),
            makeUserMessage("user 3"),
            makeAssistantMessage("assistant 3"),
            makeUserMessage("user 4"),
            makeAssistantMessage("assistant 4"),
          ],
        }),
      },
    }
    const manager = createManagerWithCompression(client)
    stubNotifyParentSession(manager)

    const task = createMockTask({
      id: "task-no-truncate",
      sessionID: "session-no-truncate",
      parentSessionID: "parent-session",
      status: "running",
    })

    // when
    const completed = await tryCompleteTaskForTest(manager, task)

    // then - only 4 assistant msgs, <= 6 so no truncation
    expect(completed).toBe(true)
    expect(task.status).toBe("completed")
    expect((task as BackgroundTask & { compactedResult?: string }).compactedResult).toBeUndefined()

    manager.shutdown()
  })

  test("should truncate when assistant messages > maxMessages (6)", async () => {
    // given - 8 assistant messages > 6 default maxMessages
    const client = {
      session: {
        prompt: async () => ({}),
        promptAsync: async () => ({}),
        abort: async () => ({}),
        messages: async () => ({
          data: [
            makeAssistantMessage("first response"),
            makeAssistantMessage("second response"),
            makeAssistantMessage("third response"),
            makeAssistantMessage("fourth response"),
            makeAssistantMessage("fifth response"),
            makeAssistantMessage("sixth response"),
            makeAssistantMessage("seventh response"),
            makeAssistantMessage("eighth response"),
          ],
        }),
      },
    }
    const manager = createManagerWithCompression(client)
    stubNotifyParentSession(manager)

    const task = createMockTask({
      id: "task-truncate",
      sessionID: "session-truncate",
      parentSessionID: "parent-session",
      status: "running",
    })

    // when
    const completed = await tryCompleteTaskForTest(manager, task)

    // then
    expect(completed).toBe(true)
    expect(task.status).toBe("completed")

    const compacted = (task as BackgroundTask & { compactedResult?: string }).compactedResult
    expect(compacted).toBeDefined()

    // Should contain first 2 and last 3, with truncated marker
    expect(compacted).toContain("first response")
    expect(compacted).toContain("second response")
    expect(compacted).toContain("sixth response")
    expect(compacted).toContain("seventh response")
    expect(compacted).toContain("eighth response")

    // Should NOT contain middle messages
    expect(compacted).not.toContain("third response")
    expect(compacted).not.toContain("fourth response")
    expect(compacted).not.toContain("fifth response")

    // Should contain truncated message count (8 - 2 - 3 = 3)
    expect(compacted).toContain("3 messages truncated")

    manager.shutdown()
  })

  test("should gracefully handle fetch failures (no throw)", async () => {
    // given
    const client = {
      session: {
        prompt: async () => ({}),
        promptAsync: async () => ({}),
        abort: async () => ({}),
        messages: async () => {
          throw new Error("network failure")
        },
      },
    }
    const manager = createManagerWithCompression(client)
    stubNotifyParentSession(manager)

    const task = createMockTask({
      id: "task-fetch-fail",
      sessionID: "session-fetch-fail",
      parentSessionID: "parent-session",
      status: "running",
    })

    // when
    const completed = await tryCompleteTaskForTest(manager, task)

    // then - task should complete gracefully despite fetch failure
    expect(completed).toBe(true)
    expect(task.status).toBe("completed")
    expect((task as BackgroundTask & { compactedResult?: string }).compactedResult).toBeUndefined()

    manager.shutdown()
  })

  test("should filter assistant messages and skip user/tool-only messages", async () => {
    // given - 7 assistant messages > 6, mixed with user messages
    const client = {
      session: {
        prompt: async () => ({}),
        promptAsync: async () => ({}),
        abort: async () => ({}),
        messages: async () => ({
          data: [
            makeUserMessage("user question"),
            makeAssistantMessage("first answer"),
            makeUserMessage("user followup"),
            makeAssistantMessage("second answer"),
            makeUserMessage("user more"),
            makeAssistantMessage("third answer"),
            makeUserMessage("user yet more"),
            makeAssistantMessage("fourth answer"),
            makeUserMessage("user again"),
            makeAssistantMessage("fifth answer"),
            makeUserMessage("user last"),
            makeAssistantMessage("sixth answer"),
            makeUserMessage("user final"),
            makeAssistantMessage("seventh answer"),
          ],
        }),
      },
    }
    const manager = createManagerWithCompression(client)
    stubNotifyParentSession(manager)

    const task = createMockTask({
      id: "task-filter",
      sessionID: "session-filter",
      parentSessionID: "parent-session",
      status: "running",
    })

    // when
    const completed = await tryCompleteTaskForTest(manager, task)

    // then - only assistant msgs counted: 7 > 6, so truncation happens
    expect(completed).toBe(true)
    expect(task.status).toBe("completed")

    const compacted = (task as BackgroundTask & { compactedResult?: string }).compactedResult
    expect(compacted).toBeDefined()

    // Should contain first 2 and last 3 assistant responses
    expect(compacted).toContain("first answer")
    expect(compacted).toContain("second answer")
    expect(compacted).toContain("fifth answer")
    expect(compacted).toContain("sixth answer")
    expect(compacted).toContain("seventh answer")

    // Should NOT contain middle assistant responses
    expect(compacted).not.toContain("third answer")
    expect(compacted).not.toContain("fourth answer")

    // Should NOT contain user messages
    expect(compacted).not.toContain("user question")
    expect(compacted).not.toContain("user followup")

    // Should contain truncated message count (7 - 2 - 3 = 2)
    expect(compacted).toContain("2 messages truncated")

    manager.shutdown()
  })

  test("should use custom keepFirst/keepLast from config", async () => {
    // given - 6 assistant messages, custom keepFirst=1, keepLast=1, maxMessages=3
    const client = {
      session: {
        prompt: async () => ({}),
        promptAsync: async () => ({}),
        abort: async () => ({}),
        messages: async () => ({
          data: [
            makeAssistantMessage("msg 1"),
            makeAssistantMessage("msg 2"),
            makeAssistantMessage("msg 3"),
            makeAssistantMessage("msg 4"),
            makeAssistantMessage("msg 5"),
            makeAssistantMessage("msg 6"),
          ],
        }),
      },
    }
    const customCompression: DcpHandoffCompression = {
      enabled: true,
      maxMessages: 3,
      keepFirst: 1,
      keepLast: 1,
    }
    const manager = createManagerWithCompression(client, customCompression)
    stubNotifyParentSession(manager)

    const task = createMockTask({
      id: "task-custom-compression",
      sessionID: "session-custom-compression",
      parentSessionID: "parent-session",
      status: "running",
    })

    // when
    const completed = await tryCompleteTaskForTest(manager, task)

    // then
    expect(completed).toBe(true)
    expect(task.status).toBe("completed")

    const compacted = (task as BackgroundTask & { compactedResult?: string }).compactedResult
    expect(compacted).toBeDefined()

    // Should contain first 1 and last 1
    expect(compacted).toContain("msg 1")
    expect(compacted).toContain("msg 6")

    // Should NOT contain middle messages
    expect(compacted).not.toContain("msg 2")
    expect(compacted).not.toContain("msg 3")
    expect(compacted).not.toContain("msg 4")
    expect(compacted).not.toContain("msg 5")

    // 6 - 1 - 1 = 4 truncated
    expect(compacted).toContain("4 messages truncated")

    manager.shutdown()
  })
})

describe("formatTaskResult with compactedResult", () => {
  test("should return compactedResult when present", async () => {
    // given
    const task: BackgroundTask & { compactedResult?: string } = {
      id: "task-compacted",
      sessionID: "session-compacted",
      parentSessionID: "parent-session",
      parentMessageID: "msg-1",
      description: "compacted task",
      prompt: "test",
      agent: "trinity",
      status: "completed",
      startedAt: new Date(),
      completedAt: new Date(),
      compactedResult: "first output\n\n[... 3 messages truncated]\n\nlast output",
    }

    const { formatTaskResult } = await import("../../../src/tools/background-task/task-result-format")

    const client = {
      session: {
        messages: async () => {
          throw new Error("should not be called")
        },
      },
    }

    // when
    const result = await formatTaskResult(task, client as Parameters<typeof formatTaskResult>[1])

    // then
    expect(result).toContain("Task Result")
    expect(result).toContain("Task ID: task-compacted")
    expect(result).toContain("Description: compacted task")
    expect(result).toContain("Session ID: session-compacted")
    expect(result).toContain("first output")
    expect(result).toContain("[... 3 messages truncated]")
    expect(result).toContain("last output")
  })
})
