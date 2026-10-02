/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { ContextModeConfigSchema } from "../../src/config/schema/context-mode"
import { CONTEXT_MODE_DEFAULT_BLOCKED_TOOLS } from "../../src/shared/context-mode-enforcement"

describe("ContextModeConfigSchema blocked_tools", () => {
  test("defaults to the canonical blocked-tools constant", () => {
    //#given an empty context_mode block
    const input = {}

    //#when parsed
    const result = ContextModeConfigSchema.parse(input)

    //#then the default is the shared canonical constant
    expect(result.blocked_tools).toEqual([...CONTEXT_MODE_DEFAULT_BLOCKED_TOOLS])
    expect(result.blocked_tools).toEqual(["grep", "glob", "webfetch"])
  })

  test("enforce stays opt-in", () => {
    //#given an empty context_mode block
    const input = {}

    //#when parsed
    const result = ContextModeConfigSchema.parse(input)

    //#then enforcement remains off by default
    expect(result.enforce).toBe(false)
  })

  test("rejects tool names outside the allowed enum", () => {
    //#given an unsupported tool name
    const input = { blocked_tools: ["not_a_tool"] }

    //#when parsed
    const result = ContextModeConfigSchema.safeParse(input)

    //#then validation fails
    expect(result.success).toBe(false)
  })

  test("accepts every allowed tool name", () => {
    //#given the full allowed set
    const input = { blocked_tools: ["read", "grep", "glob", "bash", "webfetch"] as const }

    //#when parsed
    const result = ContextModeConfigSchema.safeParse(input)

    //#then validation succeeds unchanged
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.blocked_tools).toEqual([...input.blocked_tools])
    }
  })
})