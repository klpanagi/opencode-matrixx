/// <reference types="bun-types" />

import { describe, expect, mock, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import type { BackgroundManager } from "../../../src/features/background-agent"
import { clearPendingStore, consumeToolMetadata } from "../../../src/features/tool-metadata-store"
import { createBackgroundWaitAll } from "../../../src/tools/background-task/create-background-wait-all"

function createMockContext(): ToolContext {
  return {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
  } as unknown as ToolContext
}

function createMockContextWithCallID(callID: string): ToolContext {
  return {
    ...createMockContext(),
    callID,
  } as unknown as ToolContext
}

describe("background_wait_all", () => {
  test("returns 'nothing to wait for' when no background tasks exist", async () => {
    // #given
    const mockManager = {
      waitForAllDescendants: mock(async () => ({ completed: [], timedOut: [] })),
    } as unknown as BackgroundManager
    const tool = createBackgroundWaitAll(mockManager)

    // #when
    const output = await tool.execute({}, createMockContext())

    // #then
    expect(output).toBe("No background tasks were running or pending. Nothing to wait for.")
    expect(mockManager.waitForAllDescendants).toHaveBeenCalledWith("test-session", 30000)
  })

  test("returns completed tasks table", async () => {
    // #given
    const mockManager = {
      waitForAllDescendants: mock(async () => ({
        completed: [
          { id: "task-1", description: "explore auth", agent: "trinity", status: "completed" },
          { id: "task-2", description: "search docs", agent: "operator", status: "completed" },
        ],
        timedOut: [],
      })),
    } as unknown as BackgroundManager
    const tool = createBackgroundWaitAll(mockManager)

    // #when
    const output = await tool.execute({}, createMockContext())

    // #then
    expect(output).toContain("## Completed (2)")
    expect(output).toContain("| `task-1` | explore auth | trinity | completed |")
    expect(output).toContain("| `task-2` | search docs | operator | completed |")
    expect(output).not.toContain("Timed Out")
  })

  test("returns timedOut tasks with guidance message", async () => {
    // #given
    const mockManager = {
      waitForAllDescendants: mock(async () => ({
        completed: [],
        timedOut: [
          { id: "task-slow", description: "slow query", agent: "trinity", status: "running" },
        ],
      })),
    } as unknown as BackgroundManager
    const tool = createBackgroundWaitAll(mockManager)

    // #when
    const output = await tool.execute({}, createMockContext())

    // #then
    expect(output).toContain("## Timed Out (1)")
    expect(output).toContain("| `task-slow` | slow query | trinity | running |")
    expect(output).toContain("Use `background_output(task_id=\"...\")`")
    expect(output).toContain("`background_cancel(all=true)` to clean up")
  })

  test("returns both completed and timedOut sections", async () => {
    // #given
    const mockManager = {
      waitForAllDescendants: mock(async () => ({
        completed: [
          { id: "task-fast", description: "fast query", agent: "trinity", status: "completed" },
        ],
        timedOut: [
          { id: "task-slow", description: "slow query", agent: "trinity", status: "running" },
        ],
      })),
    } as unknown as BackgroundManager
    const tool = createBackgroundWaitAll(mockManager)

    // #when
    const output = await tool.execute({}, createMockContext())

    // #then
    expect(output).toContain("## Completed (1)")
    expect(output).toContain("## Timed Out (1)")
  })

  test("passes custom timeout to waitForAllDescendants", async () => {
    // #given
    const mockManager = {
      waitForAllDescendants: mock(async () => ({ completed: [], timedOut: [] })),
    } as unknown as BackgroundManager
    const tool = createBackgroundWaitAll(mockManager)

    // #when
    await tool.execute({ timeout: 5000 }, createMockContext())

    // #then
    expect(mockManager.waitForAllDescendants).toHaveBeenCalledWith("test-session", 5000)
  })

  test("caps timeout at 120000", async () => {
    // #given
    const mockManager = {
      waitForAllDescendants: mock(async () => ({ completed: [], timedOut: [] })),
    } as unknown as BackgroundManager
    const tool = createBackgroundWaitAll(mockManager)

    // #when - pass a value larger than the cap
    await tool.execute({ timeout: 999999 }, createMockContext())

    // #then - should be capped at 120000
    expect(mockManager.waitForAllDescendants).toHaveBeenCalledWith("test-session", 120000)
  })

  test("defaults to 30000 when no timeout provided", async () => {
    // #given
    const mockManager = {
      waitForAllDescendants: mock(async () => ({ completed: [], timedOut: [] })),
    } as unknown as BackgroundManager
    const tool = createBackgroundWaitAll(mockManager)

    // #when
    await tool.execute({}, createMockContext())

    // #then
    expect(mockManager.waitForAllDescendants).toHaveBeenCalledWith("test-session", 30000)
  })

  test("sets title metadata on execute", async () => {
    // #given
    clearPendingStore()
    const metadataMock = mock(() => {})
    const mockManager = {
      waitForAllDescendants: mock(async () => ({ completed: [], timedOut: [] })),
    } as unknown as BackgroundManager
    const tool = createBackgroundWaitAll(mockManager)
    const ctx = createMockContextWithCallID("call-wait-all")

    // #when
    await tool.execute({}, ctx)

    // #then
    const restored = consumeToolMetadata("test-session", "call-wait-all")
    expect(restored?.title).toBe("Wait for all background tasks")
    expect(restored?.metadata).toEqual({ timeoutMs: 30000 })
  })

  test("includes timeoutMs in metadata", async () => {
    // #given
    clearPendingStore()
    const metadataMock = mock(() => {})
    const mockManager = {
      waitForAllDescendants: mock(async () => ({ completed: [], timedOut: [] })),
    } as unknown as BackgroundManager
    const tool = createBackgroundWaitAll(mockManager)
    const ctx = createMockContextWithCallID("call-wait-all-2")

    // #when
    await tool.execute({ timeout: 60000 }, ctx)

    // #then
    const restored = consumeToolMetadata("test-session", "call-wait-all-2")
    expect(restored?.metadata).toEqual({ timeoutMs: 60000 })
  })

  test("returns error message when waitForAllDescendants throws", async () => {
    // #given
    const mockManager = {
      waitForAllDescendants: mock(async () => {
        throw new Error("something went wrong")
      }),
    } as unknown as BackgroundManager
    const tool = createBackgroundWaitAll(mockManager)

    // #when
    const output = await tool.execute({}, createMockContext())

    // #then
    expect(output).toContain("[ERROR]")
    expect(output).toContain("something went wrong")
  })

  test("handles non-Error throw gracefully", async () => {
    // #given
    const mockManager = {
      waitForAllDescendants: mock(async () => {
        // eslint-disable-next-line no-throw-literal
        throw "string error"
      }),
    } as unknown as BackgroundManager
    const tool = createBackgroundWaitAll(mockManager)

    // #when
    const output = await tool.execute({}, createMockContext())

    // #then
    expect(output).toContain("[ERROR]")
    expect(output).toContain("string error")
  })
})
