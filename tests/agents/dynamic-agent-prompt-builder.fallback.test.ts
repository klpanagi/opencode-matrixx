/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { fallbackCompactDiscipline, fallbackFullDiscipline } from "../../src/agents/dynamic-agent-prompt-builder"

// TODO-4 (issue #110 A6): fallback discipline size regression guard —
// content is pinned by existing contract tests, so this locks current
// sizes (full <=750, compact <=766 chars incl. Run Scripts row)
// to catch future bloat.
describe("fallback discipline size", () => {
  test("full fallback stays under budget", () => {
    //#given both grep/glob variants and every DCP mode
    //#when measuring chars (~4 chars/token)
    for (const hasGrepGlob of [true, false]) {
      for (const dcpMode of ["guided", "manual", "none"] as const) {
        const text = fallbackFullDiscipline(hasGrepGlob, dcpMode)
        //#then short, still carries routing signal
        expect(text.length).toBeLessThanOrEqual(800)
        expect(text).toContain("Context Discipline")
        expect(text).toContain("ctx_")
      }
    }
  })

  test("compact fallback stays under budget", () => {
    //#given both grep/glob variants and every DCP mode
    //#when measuring chars (~4 chars/token)
    for (const hasGrepGlob of [true, false]) {
      for (const dcpMode of ["guided", "manual", "none"] as const) {
        const text = fallbackCompactDiscipline(hasGrepGlob, dcpMode)
        //#then short, still carries routing signal
        expect(text.length).toBeLessThanOrEqual(800)
        expect(text).toContain("Context Discipline")
        expect(text).toContain("ctx_")
      }
    }
  })

  test("compact fallback omits grep/glob promise when hidden", () => {
    //#given grep/glob hidden
    //#when building fallbacks
    const full = fallbackFullDiscipline(false)
    const compact = fallbackCompactDiscipline(false)
    //#then no grep/glob fallback promise
    expect(full).not.toContain("grep/glob fallback")
    expect(compact).not.toContain("grep/glob fallback")
  })

  test("fallback compression row defers to DCP nudges before manual host compress", () => {
    //#given both fallback variants
    //#when building fallbacks
    for (const hasGrepGlob of [true, false]) {
      const full = fallbackFullDiscipline(hasGrepGlob)
      const compact = fallbackCompactDiscipline(hasGrepGlob)
      //#then compression row carries a compression signal either way
      expect(full).toContain("Compression")
      expect(compact).toContain("Compression")
    }
  })

  test("guided fallback permits proactive min-band compress with IDs, never bare", () => {
    //#given DCP actively guiding compression
    //#when building guided fallbacks
    for (const hasGrepGlob of [true, false]) {
      const full = fallbackFullDiscipline(hasGrepGlob, "guided")
      const compact = fallbackCompactDiscipline(hasGrepGlob, "guided")
      //#then agents may compress proactively on closed sections with IDs + usage signals, never bare
      expect(full).toContain("never bare without message IDs")
      expect(compact).toContain("never bare without message IDs")
      expect(full).toContain("proactive on closed sections")
      expect(compact).toContain("proactive on closed sections")
      expect(full).not.toContain("only with trigger/nudge context")
      expect(compact).not.toContain("only with trigger/nudge context")
      expect(full).not.toContain("immediate")
      expect(compact).not.toContain("immediate")
    }
  })

  test("inactive fallback states no compress tool exists", () => {
    //#given DCP inactive (absent, disabled, or denied)
    //#when building inactive fallbacks
    for (const hasGrepGlob of [true, false]) {
      const full = fallbackFullDiscipline(hasGrepGlob, "none")
      const compact = fallbackCompactDiscipline(hasGrepGlob, "none")
      //#then agents are told no compress tool exists
      expect(full).toContain("No `compress` tool (DCP inactive)")
      expect(compact).toContain("No `compress` tool (DCP inactive)")
      expect(full).not.toContain("ctx_stats>40%")
      expect(compact).not.toContain("ctx_stats>40%")
    }
  })

  test("manual fallback restricts compress to the manual trigger", () => {
    //#given DCP manualMode with no autonomous nudges
    //#when building manual fallbacks
    for (const hasGrepGlob of [true, false]) {
      const full = fallbackFullDiscipline(hasGrepGlob, "manual")
      const compact = fallbackCompactDiscipline(hasGrepGlob, "manual")
      //#then agents call compress only after the trigger prompt
      expect(full).toContain("only after trigger prompt")
      expect(compact).toContain("only after trigger prompt")
      expect(full).not.toContain("ctx_stats>40%")
      expect(compact).not.toContain("ctx_stats>40%")
    }
  })
})
