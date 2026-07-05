import { describe, expect, test } from "bun:test"

import {
  _resetAssemblyStateForTesting,
  disableAssembly,
  enableAssembly,
  isAssemblyDisabled,
} from "./manager"

describe("assembly-state", () => {
  test("should start with assembly enabled (not disabled) for any session", () => {
    _resetAssemblyStateForTesting()
    expect(isAssemblyDisabled("test-session")).toBe(false)
  })

  test("should mark assembly as disabled for a session", () => {
    _resetAssemblyStateForTesting()
    const sessionID = "test-session-1"

    disableAssembly(sessionID)

    expect(isAssemblyDisabled(sessionID)).toBe(true)
  })

  test("should re-enable assembly after disabling", () => {
    _resetAssemblyStateForTesting()
    const sessionID = "test-session-2"

    disableAssembly(sessionID)
    expect(isAssemblyDisabled(sessionID)).toBe(true)

    enableAssembly(sessionID)
    expect(isAssemblyDisabled(sessionID)).toBe(false)
  })

  test("should handle multiple sessions independently", () => {
    _resetAssemblyStateForTesting()
    const session1 = "session-1"
    const session2 = "session-2"

    disableAssembly(session1)

    expect(isAssemblyDisabled(session1)).toBe(true)
    expect(isAssemblyDisabled(session2)).toBe(false)
  })

  test("should not throw when enabling an already-enabled session", () => {
    _resetAssemblyStateForTesting()
    const sessionID = "test-session-3"

    expect(() => enableAssembly(sessionID)).not.toThrow()
    expect(isAssemblyDisabled(sessionID)).toBe(false)
  })

  test("should not throw when disabling an already-disabled session", () => {
    _resetAssemblyStateForTesting()
    const sessionID = "test-session-4"

    disableAssembly(sessionID)
    expect(() => disableAssembly(sessionID)).not.toThrow()
    expect(isAssemblyDisabled(sessionID)).toBe(true)
  })

  test("should clear assembly state on reset", () => {
    _resetAssemblyStateForTesting()
    const sessionID = "test-session-5"

    disableAssembly(sessionID)
    expect(isAssemblyDisabled(sessionID)).toBe(true)

    _resetAssemblyStateForTesting()
    expect(isAssemblyDisabled(sessionID)).toBe(false)
  })
})
