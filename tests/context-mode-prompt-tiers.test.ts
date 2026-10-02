/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test"

import {
  _resetDisciplineCacheForTesting,
  buildCompactContextDisciplineSection,
  buildContextDisciplineSection,
  buildExploreDisciplineSection,
  contextModeDisciplinePointer,
  contextModeDisciplinePointerBody,
  fallbackCompactDiscipline,
  fallbackFullDiscipline,
} from "../src/agents/dynamic-agent-prompt-builder"
import {
  _resetContextModeEnforcementForTesting,
  _setDisciplinePathForTesting,
} from "../src/shared/context-mode-enforcement"

const FULL_TEXT = "### Context Discipline (ALWAYS)"

/**
 * A real path is enough to make `hasWorkingSubstitute()` true — the substitute
 * check is existence-based, so the pointer tiers engage whenever the
 * context-mode package is installed.
 */
function setSubstitute(present: boolean): void {
  _setDisciplinePathForTesting(present ? "/nonexistent/context-mode/AGENTS.md" : null)
  _resetDisciplineCacheForTesting()
}

describe("T8 pointer tiers (hasWorkingSubstitute() true)", () => {
  it("emits the minimal pointer from buildContextDisciplineSection (morpheus/keymaker Path A)", () => {
    //#given: the context-mode package is present
    setSubstitute(true)

    //#when: the Path-A tier renders the full block
    const result = buildContextDisciplineSection(true, true)

    //#then: it is the pointer, not the static table
    expect(result).toBe(contextModeDisciplinePointer("full"))
    expect(result).not.toContain(FULL_TEXT)
  })

  it("emits the minimal pointer from buildCompactContextDisciplineSection", () => {
    //#given: the context-mode package is present
    setSubstitute(true)

    //#when: the compact tier renders
    const result = buildCompactContextDisciplineSection(true, true)

    //#then: it is the pointer
    expect(result).toBe(contextModeDisciplinePointer("compact"))
    expect(result).not.toContain("| Scenario | Tool |")
  })

  it("emits the minimal pointer from buildExploreDisciplineSection (injectContextDiscipline explore tier)", () => {
    //#given: the context-mode package is present
    setSubstitute(true)

    //#when: the explore tier renders its ctx part
    const result = buildExploreDisciplineSection(true, false, true)

    //#then: ctx part is the pointer, headroom part absent
    expect(result).toContain(contextModeDisciplinePointerBody())
    expect(result).not.toContain("grep/glob fallback")
  })

  it("shrinks fallbackCompactDiscipline to the pointer", () => {
    //#given: the context-mode package is present
    setSubstitute(true)

    //#when: the compact fallback is requested
    const result = fallbackCompactDiscipline(true, "guided")

    //#then: it is the pointer
    expect(result).toBe(contextModeDisciplinePointer("compact"))
  })
})

describe("T8 kept fallback (package absent)", () => {
  it("keeps fallbackFullDiscipline verbatim", () => {
    //#given: the context-mode package is absent
    setSubstitute(false)

    //#when: the full fallback is requested
    const result = fallbackFullDiscipline(true, "guided")

    //#then: the full static table is retained verbatim
    expect(result).toContain(FULL_TEXT)
    expect(result).toContain("| Scenario | Tool |")
    expect(result).toContain("Analysis / Processing")
    expect(result).toContain("Run Scripts")
  })

  it("keeps fallbackFullDiscipline verbatim at the Path-A tier", () => {
    //#given: the context-mode package is absent
    setSubstitute(false)

    //#when: the Path-A tier renders
    const result = buildContextDisciplineSection(true, true, "guided")

    //#then: the static discipline table survives
    expect(result).toContain(FULL_TEXT)
    expect(result).toContain("| Scenario | Tool |")
  })

  it("keeps the explore ctx guidance verbatim", () => {
    //#given: the context-mode package is absent
    setSubstitute(false)

    //#when: the explore tier renders its ctx part
    const result = buildExploreDisciplineSection(true, false, true)

    //#then: the original guidance survives
    expect(result).toContain("grep/glob fallback")
    expect(result).not.toContain(contextModeDisciplinePointerBody())
  })

  it("never drops the pointer entirely — it names ctx_* tools and the marker", () => {
    //#given: any tier
    setSubstitute(true)

    //#when: each pointer variant renders
    const full = contextModeDisciplinePointer("full")
    const compact = contextModeDisciplinePointer("compact")
    const explore = contextModeDisciplinePointer("explore")

    //#then: each names ctx_* tools and the session marker block
    for (const pointer of [full, compact, explore]) {
      expect(pointer).toContain("ctx_")
      expect(pointer).toContain("<context_window_protection>")
      expect(pointer).toContain("Context Discipline")
    }
  })
})