/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { fallbackCompactDiscipline, fallbackFullDiscipline } from "../../src/agents/dynamic-agent-prompt-builder"

// TODO-4 (issue #110 A6): fallback discipline size regression guard —
// content is pinned by existing contract tests, so this locks current
// sizes (full 577/623, compact 593/617 chars) to catch future bloat.
describe("fallback discipline size", () => {
  test("full fallback stays under budget", () => {
    //#given both grep/glob variants
    //#when measuring chars (~4 chars/token)
    for (const hasGrepGlob of [true, false]) {
      const text = fallbackFullDiscipline(hasGrepGlob)
      //#then short, still carries routing signal
      expect(text.length).toBeLessThanOrEqual(650)
      expect(text).toContain("Context Discipline")
      expect(text).toContain("ctx_")
    }
  })

  test("compact fallback stays under budget", () => {
    //#given both grep/glob variants
    //#when measuring chars (~4 chars/token)
    for (const hasGrepGlob of [true, false]) {
      const text = fallbackCompactDiscipline(hasGrepGlob)
      //#then short, still carries routing signal
      expect(text.length).toBeLessThanOrEqual(650)
      expect(text).toContain("Context Discipline")
      expect(text).toContain("ctx_")
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
})
