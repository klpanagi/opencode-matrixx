import { describe, expect, test } from "bun:test"
import { clearSessionModel, getSessionModel, isMainSessionCandidate, setSessionModel } from "./state"

describe("isMainSessionCandidate", () => {
  test("//#given a top-level session without metadata\n//#when checked\n//#then it is a main session candidate", () => {
    expect(isMainSessionCandidate({ id: "ses_main", parentID: undefined })).toBe(true)
  })

  test("//#given a subagent session (has parentID)\n//#when checked\n//#then it is NOT a main session candidate", () => {
    expect(isMainSessionCandidate({ id: "ses_sub", parentID: "ses_main" })).toBe(false)
  })

  test("//#given a foreign-plugin internal session (metadata.internal=true)", () => {
    expect(
      isMainSessionCandidate({
        id: "ses_capture",
        parentID: undefined,
        metadata: { "opencode-mem": { internal: true, purpose: "structured-output" } },
      }),
    ).toBe(false)
  })

  test("//#given a foreign-plugin internal session (flat namespaced metadata key)", () => {
    expect(
      isMainSessionCandidate({
        id: "ses_capture",
        parentID: undefined,
        metadata: { "opencode-mem.internal": true, "opencode-mem.purpose": "structured-output" },
      }),
    ).toBe(false)
  })

  test("//#given a top-level session with non-internal metadata\n//#when checked\n//#then it IS a main session candidate", () => {
    expect(isMainSessionCandidate({ id: "ses_main", parentID: undefined, metadata: { foo: "bar" } })).toBe(true)
  })

  test("//#given undefined session info\n//#when checked\n//#then it is NOT a main session candidate", () => {
    expect(isMainSessionCandidate(undefined)).toBe(false)
  })
})

describe("session model state", () => {
  test("stores and retrieves a session model id", () => {
    //#given
    const sid = "ses_test_model"

    //#when
    setSessionModel(sid, "deepseek/deepseek-v4.1-flash")

    //#then
    expect(getSessionModel(sid)).toBe("deepseek/deepseek-v4.1-flash")
  })

  test("clears a stored session model id", () => {
    //#given
    const sid = "ses_test_model_clear"
    setSessionModel(sid, "anthropic/claude-sonnet-4")

    //#when
    clearSessionModel(sid)

    //#then
    expect(getSessionModel(sid)).toBeUndefined()
  })

  test("returns undefined for an unknown session", () => {
    //#given
    const sid = "ses_test_model_unknown"

    //#when
    const model = getSessionModel(sid)

    //#then
    expect(model).toBeUndefined()
  })
})