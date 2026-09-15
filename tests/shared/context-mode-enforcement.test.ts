/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import {
  _setDisciplinePathForTesting,
  CONTEXT_MODE_DEFAULT_BLOCKED_TOOLS,
  hasGrepGlobToolNames,
  resolveContextModeEnforcement,
  resolveGrepGlobUsable,
  willBlockGrepGlob,
} from "../../src/shared/context-mode-enforcement"

const FAKE_PATH = "/nonexistent-fake/AGENTS.md"

describe("context-mode-enforcement", () => {
  test("canonical default blocks grep and glob only", () => {
    //#given: the shared default
    //#when: inspected
    //#then: hook, constants and schema agree on it
    expect([...CONTEXT_MODE_DEFAULT_BLOCKED_TOOLS]).toEqual(["grep", "glob"])
  })

  test("resolveContextModeEnforcement applies defaults", () => {
    //#given: no config
    //#when: resolved
    const got = resolveContextModeEnforcement(undefined)
    //#then: enabled, warn-only, grep+glob
    expect(got).toEqual({ enabled: true, enforce: false, blockedTools: ["grep", "glob"] })
  })

  test("resolveContextModeEnforcement lowercases blocked tools", () => {
    //#given: mixed-case config
    //#when: resolved
    const got = resolveContextModeEnforcement({ enforce: true, blocked_tools: ["Grep", "READ"] })
    //#then: normalized
    expect(got).toEqual({ enabled: true, enforce: true, blockedTools: ["grep", "read"] })
  })

  test("hasGrepGlobToolNames matches exact tool names", () => {
    //#given: tool name lists
    //#when: checked
    //#then: exact lowercase match only
    expect(hasGrepGlobToolNames(["grep", "glob"])).toBe(true)
    expect(hasGrepGlobToolNames(["grep"])).toBe(true)
    expect(hasGrepGlobToolNames(["ctx_search", "read"])).toBe(false)
    expect(hasGrepGlobToolNames([])).toBe(false)
    expect(hasGrepGlobToolNames(["Grep"])).toBe(false)
  })

  test("grep/glob usable when enforce is off", () => {
    //#given: grep registered, warn-only mode
    _setDisciplinePathForTesting(FAKE_PATH)
    //#when: resolved
    //#then: prompt may advertise the fallback
    expect(resolveGrepGlobUsable(["ctx_search", "grep"], { enforce: false })).toBe(true)
  })

  test("grep/glob not usable when enforced with a working substitute", () => {
    //#given: grep registered, enforce on, substitute present
    _setDisciplinePathForTesting(FAKE_PATH)
    //#when: resolved
    //#then: prompt must not advertise grep/glob
    expect(resolveGrepGlobUsable(["ctx_search", "grep", "glob"], { enforce: true })).toBe(false)
  })

  test("grep/glob usable when enforced but no substitute exists", () => {
    //#given: grep registered, enforce on, nothing indexed
    _setDisciplinePathForTesting(null)
    //#when: resolved
    //#then: block would strand the agent, so the fallback stays advertised
    expect(resolveGrepGlobUsable(["ctx_search", "grep"], { enforce: true })).toBe(true)
  })

  test("unusable when grep/glob not registered regardless of enforce", () => {
    //#given: no raw search tools
    _setDisciplinePathForTesting(FAKE_PATH)
    //#when: resolved
    //#then: nothing to advertise
    expect(resolveGrepGlobUsable(["ctx_search"], { enforce: false })).toBe(false)
    expect(resolveGrepGlobUsable(["ctx_search"], { enforce: true })).toBe(false)
  })

  test("willBlockGrepGlob matrix", () => {
    //#given: substitute present
    _setDisciplinePathForTesting(FAKE_PATH)
    //#when: checked across configs
    //#then: blocks only when enforced AND grep/glob gated AND substitute taught
    expect(willBlockGrepGlob(undefined)).toBe(false)
    expect(willBlockGrepGlob({ enforce: false })).toBe(false)
    expect(willBlockGrepGlob({ enforce: true })).toBe(true)
    expect(willBlockGrepGlob({ enforce: true, blocked_tools: ["read"] })).toBe(false)
    expect(willBlockGrepGlob({ enforce: true, blocked_tools: ["glob"] })).toBe(true)
  })

  test("willBlockGrepGlob false without a substitute", () => {
    //#given: enforce on, nothing indexed
    _setDisciplinePathForTesting(null)
    //#when: checked
    //#then: hook must let grep/glob through
    expect(willBlockGrepGlob({ enforce: true })).toBe(false)
  })
})
