/**
 * Tests for wallclock-outcome formatter and predicate.
 *
 * Given / When / Then — no mock.module(); pure function assertions only.
 */

import { describe, expect, it } from "bun:test"
import { formatWallclockTimeout, isWallclockTimeout } from "../../../src/shared/wallclock-outcome"

describe("formatWallclockTimeout", () => {
  it("formats wall-clock-timeout with timedOut true", () => {
    //#given
    const taskId = "T-test-task-id-001"
    const elapsedMs = 120_000
    const limitMs = 300_000

    //#when
    const result = formatWallclockTimeout(taskId, elapsedMs, limitMs)

    //#then
    expect(result).toContain(`Task ID: ${taskId}`)
    expect(result).toContain(`Elapsed: 2min`)
    expect(result).toContain(`Limit: 5min`)
    expect(result).toContain("Status: cancelled")
    expect(result).toContain("Reason: wall-clock-timeout")

    // parse embedded JSON
    const metaMatch = result.match(/<task_metadata>(.*?)<\/task_metadata>/s)
    expect(metaMatch).not.toBeNull()
    const meta = JSON.parse(metaMatch![1])
    expect(meta.task_id).toBe(taskId)
    expect(meta.status).toBe("cancelled")
    expect(meta.reason).toBe("wall-clock-timeout")
    expect(meta.timedOut).toBe(true)
    expect(meta.elapsedMs).toBe(elapsedMs)
    expect(meta.limitMs).toBe(limitMs)
  })

  it("shows sub-minute duration correctly", () => {
    //#given
    const taskId = "T-short"
    const elapsedMs = 45_000
    const limitMs = 59_000

    //#when
    const result = formatWallclockTimeout(taskId, elapsedMs, limitMs)

    //#then
    expect(result).toContain("Elapsed: 45sec")
    expect(result).toContain("Limit: 59sec")
    expect(result).toContain("<task_metadata>")
  })
})

describe("isWallclockTimeout", () => {
  it("returns true for cancelled + wall-clock-timeout", () => {
    //#given
    const status = "cancelled"
    const terminalReason = "wall-clock-timeout"

    //#when
    const result = isWallclockTimeout(status, terminalReason)

    //#then
    expect(result).toBe(true)
  })

  it("stale is not wallclock-timeout", () => {
    //#given
    const status = "cancelled"
    const terminalReason = "stale"

    //#when
    const result = isWallclockTimeout(status, terminalReason)

    //#then
    expect(result).toBe(false)
  })

  it("returns false when status is error", () => {
    //#given
    const status = "error"
    const terminalReason = "wall-clock-timeout"

    //#when
    const result = isWallclockTimeout(status, terminalReason)

    //#then
    expect(result).toBe(false)
  })
})
