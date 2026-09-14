/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { getContextModeToolGuidance } from "./context-mode-prompt"

describe("getContextModeToolGuidance", () => {
  describe("enforce: true", () => {
    test("routes search to ctx_* tools and forbids grep/glob", () => {
      //#given
      const enforce = true

      //#when
      const guidance = getContextModeToolGuidance(enforce)

      //#then
      expect(guidance.searchGuidance).toContain("ctx_search")
      expect(guidance.searchGuidance).toContain("ctx_batch_execute")
      expect(guidance.searchGuidance).toContain("ctx_execute")
      expect(guidance.searchGuidance).toContain("NEVER use grep/glob")
    })

    test("routes file reading to ctx_execute_file and warns about read", () => {
      //#given
      const enforce = true

      //#when
      const guidance = getContextModeToolGuidance(enforce)

      //#then
      expect(guidance.readGuidance).toContain("ctx_execute_file")
      expect(guidance.readGuidance).toContain("read tool may produce warnings")
    })

    test("routes analysis to ctx_execute and forbids bash cat/head/tail/grep", () => {
      //#given
      const enforce = true

      //#when
      const guidance = getContextModeToolGuidance(enforce)

      //#then
      expect(guidance.analysisGuidance).toContain("ctx_execute")
      expect(guidance.analysisGuidance).toContain("ctx_execute_file")
      expect(guidance.analysisGuidance).toContain("NEVER use bash cat/head/tail/grep")
    })
  })

  describe("enforce: false", () => {
    test("preserves legacy grep/glob search guidance", () => {
      //#given
      const enforce = false

      //#when
      const guidance = getContextModeToolGuidance(enforce)

      //#then
      expect(guidance.searchGuidance).toContain("grep")
      expect(guidance.searchGuidance).toContain("glob")
      expect(guidance.searchGuidance).not.toContain("NEVER use grep/glob")
    })

    test("preserves legacy read guidance", () => {
      //#given
      const enforce = false

      //#when
      const guidance = getContextModeToolGuidance(enforce)

      //#then
      expect(guidance.readGuidance).toContain("read")
      expect(guidance.readGuidance).not.toContain("may produce warnings")
    })

    test("preserves legacy bash analysis guidance", () => {
      //#given
      const enforce = false

      //#when
      const guidance = getContextModeToolGuidance(enforce)

      //#then
      expect(guidance.analysisGuidance).toContain("bash")
      expect(guidance.analysisGuidance).not.toContain("NEVER use bash cat/head/tail/grep")
    })
  })

  describe("shape", () => {
    test("returns all three guidance fields as non-empty strings", () => {
      //#given
      const enforce = true

      //#when
      const guidance = getContextModeToolGuidance(enforce)

      //#then
      expect(typeof guidance.searchGuidance).toBe("string")
      expect(typeof guidance.readGuidance).toBe("string")
      expect(typeof guidance.analysisGuidance).toBe("string")
      expect(guidance.searchGuidance.length).toBeGreaterThan(0)
      expect(guidance.readGuidance.length).toBeGreaterThan(0)
      expect(guidance.analysisGuidance.length).toBeGreaterThan(0)
    })
  })
})
