import { describe, expect, test } from "bun:test"

import {
  _resetConsensusStateForTesting,
  disableConsensus,
  enableConsensus,
  isConsensusDisabled,
} from "./manager"

describe("consensus-state", () => {
  test("should start with consensus enabled (not disabled) for any session", () => {
    _resetConsensusStateForTesting()
    expect(isConsensusDisabled("test-session")).toBe(false)
  })

  test("should mark consensus as disabled for a session", () => {
    _resetConsensusStateForTesting()
    const sessionID = "test-session-1"

    disableConsensus(sessionID)

    expect(isConsensusDisabled(sessionID)).toBe(true)
  })

  test("should re-enable consensus after disabling", () => {
    _resetConsensusStateForTesting()
    const sessionID = "test-session-2"

    disableConsensus(sessionID)
    expect(isConsensusDisabled(sessionID)).toBe(true)

    enableConsensus(sessionID)
    expect(isConsensusDisabled(sessionID)).toBe(false)
  })

  test("should handle multiple sessions independently", () => {
    _resetConsensusStateForTesting()
    const session1 = "session-1"
    const session2 = "session-2"

    disableConsensus(session1)

    expect(isConsensusDisabled(session1)).toBe(true)
    expect(isConsensusDisabled(session2)).toBe(false)
  })

  test("should not throw when enabling an already-enabled session", () => {
    _resetConsensusStateForTesting()
    const sessionID = "test-session-3"

    expect(() => enableConsensus(sessionID)).not.toThrow()
    expect(isConsensusDisabled(sessionID)).toBe(false)
  })

  test("should not throw when disabling an already-disabled session", () => {
    _resetConsensusStateForTesting()
    const sessionID = "test-session-4"

    disableConsensus(sessionID)
    expect(() => disableConsensus(sessionID)).not.toThrow()
    expect(isConsensusDisabled(sessionID)).toBe(true)
  })

  test("should clear consensus state on reset", () => {
    _resetConsensusStateForTesting()
    const sessionID = "test-session-5"

    disableConsensus(sessionID)
    expect(isConsensusDisabled(sessionID)).toBe(true)

    _resetConsensusStateForTesting()
    expect(isConsensusDisabled(sessionID)).toBe(false)
  })
})
