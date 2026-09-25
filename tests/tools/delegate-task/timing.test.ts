/// <reference types="bun-types" />
import { afterEach, describe, expect, mock, test } from "bun:test"
import { __resetTimingConfig, __setTimingConfig, getTimingConfig, setPollTimeoutMs } from "../../../src/tools/delegate-task/timing"

describe("timing defaults", () => {
  afterEach(() => {
    __resetTimingConfig()
  })

  test("default MAX_POLL_TIME_MS is 600000 (10 min)", () => {
    //#given default state (no config override)

    //#when
    const config = getTimingConfig()

    //#then
    expect(config.MAX_POLL_TIME_MS).toBe(600_000)
  })

  test("setPollTimeoutMs updates MAX_POLL_TIME_MS", () => {
    //#given
    const customValue = 300_000

    //#when
    setPollTimeoutMs(customValue)

    //#then
    expect(getTimingConfig().MAX_POLL_TIME_MS).toBe(customValue)
  })

  test("getTimingConfig returns updated value after setPollTimeoutMs", () => {
    //#given
    const customValue = 120_000

    //#when
    setPollTimeoutMs(customValue)

    //#then
    const config = getTimingConfig()
    expect(config.MAX_POLL_TIME_MS).toBe(120_000)
    // Verify other defaults are not affected
    expect(config.POLL_INTERVAL_MS).toBe(1000)
    expect(config.MIN_STABILITY_TIME_MS).toBe(10000)
  })

  test("setPollTimeoutMs accepts zero and non-standard values", () => {
    //#given
    const edgeCases = [0, 1, 50, 500, 3600_000]

    for (const value of edgeCases) {
      //#when
      setPollTimeoutMs(value)

      //#then
      expect(getTimingConfig().MAX_POLL_TIME_MS).toBe(value)

      // reset for next iteration
      __resetTimingConfig()
    }
  })

  test("__resetTimingConfig restores MAX_POLL_TIME_MS to 600000", () => {
    //#given
    setPollTimeoutMs(999)

    //#when
    __resetTimingConfig()

    //#then
    expect(getTimingConfig().MAX_POLL_TIME_MS).toBe(600_000)
  })

  test("__setTimingConfig overrides MAX_POLL_TIME_MS", () => {
    //#given
    const overrides = { MAX_POLL_TIME_MS: 42_000 }

    //#when
    __setTimingConfig(overrides)

    //#then
    expect(getTimingConfig().MAX_POLL_TIME_MS).toBe(42_000)
  })
})

// mock.module must be at module top-level — not inside describe or test
const logCalls: Array<{ message: string; data?: Record<string, unknown> }> = []
const mockLog = mock((message: string, data?: Record<string, unknown>) => {
  logCalls.push({ message, data })
})

mock.module("../../../src/shared/logger", () => ({
  log: mockLog,
}))

describe("poll-start log integration", () => {
  afterEach(() => {
    __resetTimingConfig()
    logCalls.length = 0
  })

  test("poll-start log includes maxPollTimeMs", async () => {
    //#given — set a known poll timeout
    setPollTimeoutMs(250_000)

    // Dynamic import ensures the log mock is active
    const { pollSyncSession } = await import("../../../src/tools/delegate-task/sync-session-poller")

    // Build minimal context with abort already triggered so poll exits immediately
    const ctx = {
      abort: { aborted: true } as AbortSignal,
      client: null as never,
      sessionID: "test-session",
    }

    //#when — call pollSyncSession; it logs "Starting poll loop" then hits abort and returns
    const result = await pollSyncSession(
      ctx as never,
      {} as never,
      {
        sessionID: "test-session",
        agentToUse: "test-agent",
        toastManager: null,
        taskId: undefined,
      } as never,
    )

    //#then — the poll-start log entry includes maxPollTimeMs
    const startLog = logCalls.find((c) => c.message === "[task] Starting poll loop")
    expect(startLog).toBeDefined()
    expect(startLog!.data).toHaveProperty("maxPollTimeMs", 250_000)
    expect(result).toContain("aborted")
  })

  test("poll-start log reflects updated timeout after setPollTimeoutMs", async () => {
    //#given — set a different value
    setPollTimeoutMs(500_000)

    const { pollSyncSession } = await import("../../../src/tools/delegate-task/sync-session-poller")

    const ctx = {
      abort: { aborted: true } as AbortSignal,
      client: null as never,
      sessionID: "test-session",
    }

    //#when
    await pollSyncSession(
      ctx as never,
      {} as never,
      {
        sessionID: "test-session",
        agentToUse: "test-agent",
        toastManager: null,
        taskId: undefined,
      } as never,
    )

    //#then
    const startLog = logCalls.find((c) => c.message === "[task] Starting poll loop")
    expect(startLog).toBeDefined()
    expect(startLog!.data).toHaveProperty("maxPollTimeMs", 500_000)
  })
})
