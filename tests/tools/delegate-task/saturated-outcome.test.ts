/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { BackgroundManager } from "../../../src/features/background-agent"
import { executeBackgroundTask } from "../../../src/tools/delegate-task/background-task"
import { __resetTimingConfig, __setTimingConfig } from "../../../src/tools/delegate-task/timing"
import type { ExecutorContext, ParentContext } from "../../../src/tools/delegate-task/executor-types"
import type { DelegateTaskArgs, ToolContextWithMetadata } from "../../../src/tools/delegate-task/types"
import {
  formatLaunchFailure,
  formatSaturatedOutcome,
  isLaunchTerminalStatus,
  isQueueSaturated,
} from "../../../src/shared/saturated-outcome"

function extractTaskMetadata(text: string): Record<string, unknown> {
  const match = text.match(/<task_metadata>([\s\S]*?)<\/task_metadata>/)
  if (!match) throw new Error("task_metadata payload missing")
  return JSON.parse(match[1]) as Record<string, unknown>
}

describe("isLaunchTerminalStatus", () => {
  test("returns true for every launch terminal status", () => {
    //#given
    const terminals = ["error", "cancelled", "interrupt", "stopped", "statusUncertain"]

    //#when / #then
    for (const status of terminals) {
      expect(isLaunchTerminalStatus(status)).toBe(true)
    }
  })

  test("returns false for non-terminal statuses", () => {
    //#given
    const nonTerminals = ["pending", "running", "completed", "queued", "unknown"]

    //#when / #then
    for (const status of nonTerminals) {
      expect(isLaunchTerminalStatus(status)).toBe(false)
    }
  })
})

describe("isQueueSaturated", () => {
  test("is true only for stopped + queue-saturated", () => {
    //#given / #when / #then
    expect(isQueueSaturated("stopped", "queue-saturated")).toBe(true)
    expect(isQueueSaturated("stopped", "no-output")).toBe(false)
    expect(isQueueSaturated("stopped", undefined)).toBe(false)
    expect(isQueueSaturated("error", "queue-saturated")).toBe(false)
    expect(isQueueSaturated("statusUncertain", "queue-saturated")).toBe(false)
  })
})

describe("formatSaturatedOutcome", () => {
  test("emits machine-readable metadata parseable as JSON", () => {
    //#given
    const taskId = "bg_sat_1"

    //#when
    const text = formatSaturatedOutcome(taskId)

    //#then
    expect(text).toContain("Background task NOT admitted (queue saturated).")
    expect(text).toContain(`Task ID: ${taskId}`)
    expect(text).toContain("Status: stopped")
    expect(text).toContain("Reason: queue-saturated")
    const payload = extractTaskMetadata(text)
    expect(payload).toEqual({ task_id: taskId, status: "stopped", reason: "queue-saturated" })
  })
})

describe("formatLaunchFailure", () => {
  test("preserves the existing generic launch-failure wording", () => {
    //#given
    const taskId = "bg_err_1"
    const status = "error"

    //#when
    const text = formatLaunchFailure(taskId, status)

    //#then
    expect(text).toBe(`Task failed to start (status: ${status}).\n\nTask ID: ${taskId}`)
  })
})

describe("executeBackgroundTask saturated launch integration", () => {
  beforeEach(() => {
    __setTimingConfig({ WAIT_FOR_SESSION_INTERVAL_MS: 5, WAIT_FOR_SESSION_TIMEOUT_MS: 500 })
  })

  afterEach(() => {
    __resetTimingConfig()
  })

  test("returns structured saturation outcome when getTask is queue-saturated", async () => {
    //#given
    const manager = {
      launch: async () => ({
        id: "bg_x",
        description: "Sat task",
        agent: "mouse",
        status: "pending",
      }),
      getTask: () => ({
        id: "bg_x",
        status: "stopped",
        terminalReason: "queue-saturated",
        description: "Sat task",
        agent: "mouse",
      }),
    } as unknown as BackgroundManager
    const ctx = {
      sessionID: "ses_parent",
      messageID: "msg_1",
      agent: "mouse",
      callID: "call_1",
      metadata: async () => {},
    } as unknown as ToolContextWithMetadata
    const executorCtx: ExecutorContext = { manager, client: {} as never, directory: process.cwd() }
    const parentContext: ParentContext = { sessionID: "ses_parent", messageID: "msg_1" }
    const args = {
      description: "Sat task",
      prompt: "do things",
      run_in_background: true,
      load_skills: [],
    } as unknown as DelegateTaskArgs

    //#when
    const result = await executeBackgroundTask(args, ctx, executorCtx, parentContext, "mouse", undefined, undefined)

    //#then
    expect(result).toContain("Background task NOT admitted")
    expect(result).toContain("queue-saturated")
    expect(extractTaskMetadata(result).reason).toBe("queue-saturated")
    expect(result).not.toContain("Background task launched.")
  })

  test("successful launch keeps the existing launch text byte-for-byte", async () => {
    //#given
    const manager = {
      launch: async () => ({
        id: "bg_ok",
        description: "Ok task",
        agent: "mouse",
        status: "pending",
      }),
      getTask: () => ({
        id: "bg_ok",
        status: "running",
        sessionID: "ses_child",
        description: "Ok task",
        agent: "mouse",
      }),
    } as unknown as BackgroundManager
    const ctx = {
      sessionID: "ses_parent",
      messageID: "msg_1",
      agent: "mouse",
      callID: "call_1",
      metadata: async () => {},
    } as unknown as ToolContextWithMetadata
    const executorCtx: ExecutorContext = { manager, client: {} as never, directory: process.cwd() }
    const parentContext: ParentContext = { sessionID: "ses_parent", messageID: "msg_1" }
    const args = {
      description: "Ok task",
      prompt: "do things",
      run_in_background: true,
      load_skills: [],
    } as unknown as DelegateTaskArgs

    //#when
    const result = await executeBackgroundTask(args, ctx, executorCtx, parentContext, "mouse", undefined, undefined)

    //#then
    expect(result).toContain("Background task launched.")
    expect(result).toContain("<task_metadata>\nsession_id: ses_child")
  })
})
