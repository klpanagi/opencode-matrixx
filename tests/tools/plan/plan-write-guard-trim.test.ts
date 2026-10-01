/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { MAX_PLAN_FILE_BYTES, measurePlanBytes } from "../../../src/features/mission-state/constants"
import { PLAN_ERROR_CODES } from "../../../src/tools/plan/error-codes"
import {
  TRIM_REQUIRED_AFTER_CONSECUTIVE_REFUSALS,
  enforcePlanCap,
  resetPlanWriteGuardForTesting,
} from "../../../src/tools/plan/plan-write-guard"

function overCapGrowing(extra: number): { original: string; applied: string } {
  const original = `x`.repeat(MAX_PLAN_FILE_BYTES - 100)
  const applied = original + `y`.repeat(extra)
  expect(measurePlanBytes(applied)).toBeGreaterThan(MAX_PLAN_FILE_BYTES)
  return { original, applied }
}

describe("plan-write-guard trim protocol", () => {
  test("escalates to trim_required after consecutive growing refusals", () => {
    //#given a path with prior consecutive size refusals
    resetPlanWriteGuardForTesting()
    const resolved = "/tmp/trim-guard-escalation.md"
    const { original, applied } = overCapGrowing(500)

    //#when the same growing write is refused past the threshold
    const codes: string[] = []
    let lastPayload = ""
    for (let i = 0; i < TRIM_REQUIRED_AFTER_CONSECUTIVE_REFUSALS + 1; i++) {
      const verdict = enforcePlanCap(resolved, original, applied)
      if (verdict.kind !== "rolled-back") throw new Error("expected a refusal")
      lastPayload = verdict.payload
      codes.push((JSON.parse(verdict.payload) as { error: string }).error)
    }

    //#then early refusals stay size_exceeded and the escalation carries trim diagnostics
    expect(codes[0]).toBe(PLAN_ERROR_CODES.sizeExceeded)
    expect(codes[codes.length - 1]).toBe(PLAN_ERROR_CODES.trimRequired)
    const parsed = JSON.parse(lastPayload) as Record<string, unknown>
    expect(parsed.actual).toBe(measurePlanBytes(applied))
    expect(parsed.cap).toBe(MAX_PLAN_FILE_BYTES)
    expect(parsed.overBy).toBe(measurePlanBytes(applied) - MAX_PLAN_FILE_BYTES)
    expect(typeof parsed.headroom).toBe("number")
    expect(String(parsed.hint).toLowerCase()).toContain("trim")
  })

  test("shrinking writes are still allowed past the threshold", () => {
    //#given a path already past the consecutive-failure threshold
    resetPlanWriteGuardForTesting()
    const resolved = "/tmp/trim-guard-shrinking.md"
    const { original, applied } = overCapGrowing(500)
    for (let i = 0; i < TRIM_REQUIRED_AFTER_CONSECUTIVE_REFUSALS + 1; i++) {
      enforcePlanCap(resolved, original, applied)
    }

    //#when a write shrinks the content (applied bytes < original bytes)
    const shrunk = original.slice(0, original.length - 50)
    expect(measurePlanBytes(shrunk)).toBeLessThan(measurePlanBytes(original))
    const verdict = enforcePlanCap(resolved, original, shrunk)

    //#then it is kept, not refused
    expect(verdict.kind).toBe("keep")
  })

  test("any successful write resets the consecutive-failure counter", () => {
    //#given a path past the threshold that then succeeds
    resetPlanWriteGuardForTesting()
    const resolved = "/tmp/trim-guard-reset.md"
    const { original, applied } = overCapGrowing(500)
    for (let i = 0; i < TRIM_REQUIRED_AFTER_CONSECUTIVE_REFUSALS + 1; i++) {
      enforcePlanCap(resolved, original, applied)
    }
    const kept = enforcePlanCap(resolved, original, original.slice(0, 10))
    expect(kept.kind).toBe("keep")

    //#when the growing write is retried after the success
    const verdict = enforcePlanCap(resolved, original, applied)
    if (verdict.kind !== "rolled-back") throw new Error("expected a refusal")

    //#then the escalation restarted: back to size_exceeded, not trim_required
    expect((JSON.parse(verdict.payload) as { error: string }).error).toBe(
      PLAN_ERROR_CODES.sizeExceeded,
    )
  })
})
