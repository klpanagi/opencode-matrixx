import { describe, expect, test } from "bun:test"

import {
  _resetUltraworkStateForTesting,
  disableUltrawork,
  enableUltrawork,
  getUltraworkState,
} from "./manager"

describe("ultrawork-state", () => {
  test("should start with default state (undefined) for any session", () => {
    _resetUltraworkStateForTesting()
    expect(getUltraworkState("test-session")).toBeUndefined()
  })

  test("should enable ultrawork for a session", () => {
    _resetUltraworkStateForTesting()
    const sessionID = "test-session-1"

    enableUltrawork(sessionID)

    expect(getUltraworkState(sessionID)).toBe("enabled")
  })

  test("should disable ultrawork for a session", () => {
    _resetUltraworkStateForTesting()
    const sessionID = "test-session-2"

    disableUltrawork(sessionID)

    expect(getUltraworkState(sessionID)).toBe("disabled")
  })

  test("should toggle between enabled and disabled", () => {
    _resetUltraworkStateForTesting()
    const sessionID = "test-session-3"

    enableUltrawork(sessionID)
    expect(getUltraworkState(sessionID)).toBe("enabled")

    disableUltrawork(sessionID)
    expect(getUltraworkState(sessionID)).toBe("disabled")

    enableUltrawork(sessionID)
    expect(getUltraworkState(sessionID)).toBe("enabled")
  })

  test("should handle multiple sessions independently", () => {
    _resetUltraworkStateForTesting()
    const session1 = "session-1"
    const session2 = "session-2"

    enableUltrawork(session1)
    disableUltrawork(session2)

    expect(getUltraworkState(session1)).toBe("enabled")
    expect(getUltraworkState(session2)).toBe("disabled")
  })

  test("should return to default state after clearing", () => {
    _resetUltraworkStateForTesting()
    const sessionID = "test-session-4"

    enableUltrawork(sessionID)
    expect(getUltraworkState(sessionID)).toBe("enabled")

    disableUltrawork(sessionID)
    expect(getUltraworkState(sessionID)).toBe("disabled")
  })

  test("should clear ultrawork state on reset", () => {
    _resetUltraworkStateForTesting()
    const sessionID = "test-session-5"

    enableUltrawork(sessionID)
    expect(getUltraworkState(sessionID)).toBe("enabled")

    _resetUltraworkStateForTesting()
    expect(getUltraworkState(sessionID)).toBeUndefined()
  })
})
