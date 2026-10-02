/// <reference types="bun-types" />

import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import {
  _resetGuidanceThrottleForTesting,
  shouldShowGuidance,
} from "../../../src/hooks/context-mode-enforcer/guidance-throttle"

function markerDir(sessionID: string): string {
  return resolve(tmpdir(), `matrixx-ctx-guidance-s-${sessionID}`)
}

function clearMarkers(sessionID: string): void {
  rmSync(markerDir(sessionID), { recursive: true, force: true })
}

afterEach(() => {
  _resetGuidanceThrottleForTesting()
})

describe("shouldShowGuidance", () => {
  test("returns true once then false for the same session and type", () => {
    //#given
    _resetGuidanceThrottleForTesting()
    clearMarkers("ses_throttle_a")

    //#when
    const first = shouldShowGuidance("ses_throttle_a", "read")
    const second = shouldShowGuidance("ses_throttle_a", "read")

    //#then
    expect(first).toBe(true)
    expect(second).toBe(false)
  })

  test("returns true again for a different type in the same session", () => {
    //#given
    _resetGuidanceThrottleForTesting()
    clearMarkers("ses_throttle_b")

    //#when
    expect(shouldShowGuidance("ses_throttle_b", "read")).toBe(true)
    const secondType = shouldShowGuidance("ses_throttle_b", "bash")

    //#then
    expect(secondType).toBe(true)
  })

  test("returns true for a different session with the same type", () => {
    //#given
    _resetGuidanceThrottleForTesting()
    clearMarkers("ses_throttle_c1")
    clearMarkers("ses_throttle_c2")

    //#when
    expect(shouldShowGuidance("ses_throttle_c1", "read")).toBe(true)
    const otherSession = shouldShowGuidance("ses_throttle_c2", "read")

    //#then
    expect(otherSession).toBe(true)
  })

  test("throttles via file marker after an in-memory reset", () => {
    //#given
    _resetGuidanceThrottleForTesting()
    clearMarkers("ses_throttle_d")
    expect(shouldShowGuidance("ses_throttle_d", "read")).toBe(true)
    expect(existsSync(resolve(markerDir("ses_throttle_d"), "read"))).toBe(true)
    _resetGuidanceThrottleForTesting()

    //#when
    const afterReset = shouldShowGuidance("ses_throttle_d", "read")

    //#then
    expect(afterReset).toBe(false)
  })

  test("sanitizes unsafe characters out of the session id", () => {
    //#given
    _resetGuidanceThrottleForTesting()
    clearMarkers("etcevil")

    //#when
    const result = shouldShowGuidance("../../etc/evil", "read")

    //#then
    expect(result).toBe(true)
    expect(existsSync(resolve(tmpdir(), "matrixx-ctx-guidance-s-etcevil"))).toBe(true)
    expect(existsSync(resolve(tmpdir(), "matrixx-ctx-guidance-s-evil"))).toBe(false)
  })

  test("caps the sanitized session id length", () => {
    //#given
    _resetGuidanceThrottleForTesting()
    const longID = "a".repeat(500)
    clearMarkers("a".repeat(128))

    //#when
    expect(shouldShowGuidance(longID, "read")).toBe(true)

    //#then
    expect(existsSync(markerDir("a".repeat(128)))).toBe(true)
  })

  test("falls back to ppid when the session id is empty", () => {
    //#given
    _resetGuidanceThrottleForTesting()
    clearMarkers(String(process.ppid))

    //#when
    const result = shouldShowGuidance("", "read")

    //#then
    expect(result).toBe(true)
    expect(existsSync(markerDir(String(process.ppid)))).toBe(true)
  })

  test("fails open when the marker directory cannot be created", () => {
    //#given
    _resetGuidanceThrottleForTesting()
    // A regular file where the marker directory should go → mkdir and O_EXCL both fail.
    const blockedID = "blocked"
    clearMarkers(blockedID)
    writeFileSync(markerDir(blockedID), "not-a-dir")

    //#when
    const result = shouldShowGuidance(blockedID, "read")

    //#then
    expect(result).toBe(true)
  })
})