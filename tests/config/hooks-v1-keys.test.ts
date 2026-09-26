/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import { V1_HOOK_KEYS } from "../../src/config/schema/hooks-v1-keys"
import { createCommentCheckerHooks } from "../../src/hooks/comment-checker/hook"
import { createEvolutionCompressorHook } from "../../src/hooks/evolution-compressor"
import { createQualityGateHook } from "../../src/hooks/quality-gate/hook"

describe("V1 hook key constants", () => {
  test("evaluate to the legacy V1 hook names byte-for-byte", () => {
    //#given
    // The exact strings the V1 runtime dispatches on. Spelled literally here on
    // purpose: this test is the regression guard for the centralization in
    // `src/config/schema/hooks-v1-keys.ts`.
    const expected = {
      chatMessage: "chat.message",
      chatParams: "chat.params",
      toolExecuteBefore: "tool.execute.before",
      toolExecuteAfter: "tool.execute.after",
      messagesTransform: "experimental.chat.messages.transform",
      sessionCompacting: "experimental.session.compacting",
    }

    //#when
    const actual = V1_HOOK_KEYS

    //#then
    expect({ ...actual }).toEqual(expected)
  })
})

describe("V1 hook registration objects", () => {
  test("quality-gate still exposes the tool-execute keys", () => {
    //#given
    const hook = createQualityGateHook()

    //#when
    const keys = Object.keys(hook)

    //#then
    expect(keys).toContain("tool.execute.before")
    expect(keys).toContain("tool.execute.after")
  })

  test("comment-checker still exposes the tool-execute keys", () => {
    //#given
    const hook = createCommentCheckerHooks()

    //#when
    const keys = Object.keys(hook)

    //#then
    expect(keys).toContain("tool.execute.before")
    expect(keys).toContain("tool.execute.after")
  })

  test("evolution-compressor still exposes the session-compacting key", () => {
    //#given
    const hook = createEvolutionCompressorHook()

    //#when
    const keys = Object.keys(hook)

    //#then
    expect(keys).toContain("experimental.session.compacting")
  })
})
