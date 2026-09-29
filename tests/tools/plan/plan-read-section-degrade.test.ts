/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { MAX_PLAN_FILE_BYTES } from "../../../src/tools/plan/constants"
import { PLAN_ERROR_CODES } from "../../../src/tools/plan/error-codes"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"
import {
  buildOversizeSectionPlan,
  buildSectionedPlan,
  indexOf,
  makePlanDir,
  removePlanDir,
  testContext,
  writePlan,
} from "./plan-read-section-fixtures"

describe("plan_read section failure and degrade paths", () => {
  let testDir: string
  let tool: ReturnType<typeof createPlanReadTool>

  beforeEach(() => {
    testDir = makePlanDir()
    tool = createPlanReadTool()
  })

  afterEach(() => {
    removePlanDir(testDir)
  })

  test("an unknown section id names the selector and lists the available ids", async () => {
    //#given a plan with known sections
    const content = buildSectionedPlan()
    writePlan(testDir, "sectioned-plan.md", content)

    //#when a selector that matches nothing is supplied
    const res = JSON.parse(
      await tool.execute(
        { filePath: ".matrixx/plans/sectioned-plan.md", section: "nonexistent-section" },
        testContext(testDir),
      ),
    )

    //#then the caller can self-correct in one retry
    expect(res.error).toBe(PLAN_ERROR_CODES.sectionNotFound)
    expect(res.selector).toBe("nonexistent-section")
    expect(res.message).toContain("nonexistent-section")
    for (const id of ["todos", "tl-dr", "execution-strategy", "commit-strategy"]) {
      expect(res.message).toContain(id)
    }
  })

  test("a custom (non-registry) heading is addressable by its derived id", async () => {
    //#given a plan with a heading that is not in the registry
    const content = `${buildSectionedPlan()}## Bespoke Appendix\nbody.\n`
    writePlan(testDir, "custom-plan.md", content)

    //#when addressed by the derived kebab id
    const res = JSON.parse(
      await tool.execute(
        { filePath: ".matrixx/plans/custom-plan.md", section: "bespoke-appendix", format: "content" },
        testContext(testDir),
      ),
    )

    //#then it resolves to a real span rather than an error
    expect(res.error).toBeUndefined()
    expect(res.section.id).toBe("bespoke-appendix")
    expect(res.content).toContain("## Bespoke Appendix")
  })

  test("a single oversize section degrades instead of failing", async () => {
    //#given a plan whose TODOs section alone exceeds the rendered cap
    const content = buildOversizeSectionPlan()
    writePlan(testDir, "oversize-plan.md", content)
    const entry = indexOf(content, "todos")
    expect(entry.bytes).toBeGreaterThan(40_000)

    //#when that section is read
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/oversize-plan.md", section: "todos" }, testContext(testDir)),
    )

    //#then it is a truncation envelope, not an error, and not an empty payload
    expect(res.error).toBeUndefined()
    expect(res.truncated).toBe(true)
    expect("hashline" in res).toBe(false)
    expect("content" in res).toBe(false)
    //#then the section metadata is still returned so the span stays addressable
    expect(res.section.startLine).toBe(entry.startLine)
    expect(res.section.endLine).toBe(entry.endLine)
    //#then the outline lives INSIDE the section
    expect(Array.isArray(res.outline)).toBe(true)
    expect(res.outline.length).toBeGreaterThan(0)
    for (const item of res.outline) {
      expect(item.line).toBeGreaterThanOrEqual(entry.startLine)
      expect(item.line).toBeLessThan(entry.endLine)
    }
    //#then the hint names offset/limit scoped to THIS section
    expect(res.hint).toContain("offset")
    expect(res.hint).toContain("limit")
    expect(res.hint).toContain("section")
  })

  test("an out-of-range sectionIndex is rejected, never clamped", async () => {
    //#given a plan with two occurrences of the H3
    const content = buildSectionedPlan()
    writePlan(testDir, "sectioned-plan.md", content)

    //#when a sectionIndex beyond the last occurrence is supplied
    const res = JSON.parse(
      await tool.execute(
        { filePath: ".matrixx/plans/sectioned-plan.md", section: "agent-executed-qa-scenarios", sectionIndex: 7 },
        testContext(testDir),
      ),
    )

    //#then it is a validation_error that states the valid range
    expect(res.error).toBe(PLAN_ERROR_CODES.validationError)
    expect(res.message).toContain("0")
    expect(res.message).toContain("1")
    expect("hashline" in res).toBe(false)
  })

  test("a renamed legacy plan surfaces its lifecycle advisory without failing the read", async () => {
    //#given a renamed legacy plan (off the allowlist, carries the legacy comment)
    const content = ["<!-- plan-persister: {} -->", "", buildSectionedPlan()].join("\n")
    writePlan(testDir, "renamed-legacy-plan.md", content)

    //#when a section is read
    const res = JSON.parse(
      await tool.execute(
        { filePath: ".matrixx/plans/renamed-legacy-plan.md", section: "todos", format: "content" },
        testContext(testDir),
      ),
    )

    //#then the advisory rides along and the read still succeeds
    expect(res.error).toBeUndefined()
    expect(res.section.id).toBe("todos")
    expect(res.lifecycle.state).toBe("legacy_renamed")
    expect(res.lifecycle.warnings.length).toBeGreaterThan(0)
  })

  test("an over-cap file IS readable by section — the cap is a ceiling, not a wall", async () => {
    //#given a file over the hard cap
    writePlan(testDir, "huge-plan.md", `## TODOs\n${"x".repeat(MAX_PLAN_FILE_BYTES + 100)}`)

    //#when a section is requested
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/huge-plan.md", section: "todos", format: "content" }, testContext(testDir)),
    )

    //#then the section read proceeds and degrades on the RENDER budget, not the file cap
    // (Task 15 inverted the prior expectation: the cap is a ceiling a span read may pass.)
    expect(res.error).toBeUndefined()
    expect(res.truncated).toBe(true)
    expect(res.section.id).toBe("todos")
  })
})
