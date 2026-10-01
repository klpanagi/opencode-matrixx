/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { MAX_PLAN_FILE_BYTES } from "../../../src/features/mission-state/constants"
import { measurePlanBytes } from "../../../src/features/mission-state/constants"
import { MAX_PLAN_READ_RENDERED_BYTES } from "../../../src/tools/plan/constants"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"
import { makePlanDir, removePlanDir, testContext, writePlan } from "./plan-read-section-fixtures"

/** A plan comfortably OVER the cap (150,000 bytes) with more than 100 real lines. */
const OVER_CAP_TARGET = 150_000
const PLAN_NAME = "over-cap-plan.md"

function buildOverCapSectionedPlan(): string {
  const lines = ["# Over Cap Plan", "", "## TL;DR", "one line summary.", "", "## TODOs", ""]
  let bytes = lines.join("\n").length
  let i = 1
  while (bytes < OVER_CAP_TARGET) {
    const line = `- [ ] ${i}. task-${i}: ${"q".repeat(40)}`
    lines.push(line)
    bytes += Buffer.byteLength(`${line}\n`, "utf8")
    i++
  }
  lines.push("", "## Commit Strategy", "Merge commit only.", "")
  return lines.join("\n")
}

describe("plan_read cap is a ceiling, not a wall", () => {
  let testDir: string
  let tool: ReturnType<typeof createPlanReadTool>
  let content: string

  beforeEach(() => {
    testDir = makePlanDir()
    tool = createPlanReadTool()
    content = buildOverCapSectionedPlan()
    writePlan(testDir, PLAN_NAME, content)
  })

  afterEach(() => {
    removePlanDir(testDir)
  })

  test("the fixture really is over the cap", () => {
    //#given the synthesized over-cap plan
    //#when it is measured with the plan byte ruler
    const size = measurePlanBytes(content)
    //#then it exceeds the cap, so the refusal path is genuinely exercised
    expect(size).toBeGreaterThan(MAX_PLAN_FILE_BYTES)
  })

  test("two paginated reads reconstruct lines 1..100 byte-identically", async () => {
    //#given an over-cap plan
    const sourceLines = content.split("\n")

    //#when read as two 50-line windows
    const first = JSON.parse(
      await tool.execute({ filePath: `.matrixx/plans/${PLAN_NAME}`, format: "content", offset: 1, limit: 50 }, testContext(testDir)),
    )
    const second = JSON.parse(
      await tool.execute({ filePath: `.matrixx/plans/${PLAN_NAME}`, format: "content", offset: 51, limit: 50 }, testContext(testDir)),
    )

    //#then neither window is refused and together they are lines 1..100
    expect(first.error).toBeUndefined()
    expect(second.error).toBeUndefined()
    const window = [...first.content.split("\n"), ...second.content.split("\n")]
    expect(window.length).toBe(100)
    expect(window.join("\n")).toBe(sourceLines.slice(0, 100).join("\n"))
  })

  test("an over-cap plan is readable through a section selector", async () => {
    //#given an over-cap plan
    //#when read by section
    const res = JSON.parse(
      await tool.execute({ filePath: `.matrixx/plans/${PLAN_NAME}`, format: "content", section: "tl-dr" }, testContext(testDir)),
    )
    //#then the section span comes back with its own metadata
    expect(res.error).toBeUndefined()
    expect(res.section.id).toBe("tl-dr")
    expect(res.content).toBe("## TL;DR\none line summary.\n")
    expect(res.section.bytes).toBeGreaterThan(0)
  })

  test("the oversized section of an over-cap plan degrades, never fails", async () => {
    //#given an over-cap plan whose TODOs section alone is over the render budget
    //#when read by that section
    const res = JSON.parse(
      await tool.execute({ filePath: `.matrixx/plans/${PLAN_NAME}`, format: "content", section: "todos" }, testContext(testDir)),
    )
    //#then it degrades to an outline with the metadata that keeps the span addressable
    expect(res.error).toBeUndefined()
    expect(res.truncated).toBe(true)
    expect(res.section.startLine).toBeGreaterThan(0)
    expect(res.content).toBeUndefined()
  })

  test("a whole-file read of an over-cap plan is still refused", async () => {
    //#given an over-cap plan
    //#when read with no span selector at all
    const res = JSON.parse(await tool.execute({ filePath: `.matrixx/plans/${PLAN_NAME}` }, testContext(testDir)))
    //#then the ceiling still exists as a maximum
    expect(res.error).toBe("file_too_large")
  })

  test("an unlimited span read is clamped to the rendered budget with a named window", async () => {
    //#given an over-cap plan and an absurdly large limit
    //#when read with limit far beyond both the cap and the render budget
    const res = JSON.parse(
      await tool.execute({ filePath: `.matrixx/plans/${PLAN_NAME}`, format: "content", offset: 1, limit: 1_000_000 }, testContext(testDir)),
    )
    //#then it is not refused, and the payload is measured with the SAME ruler as the check
    expect(res.error).toBeUndefined()
    expect(measurePlanBytes(JSON.stringify(res))).toBeLessThanOrEqual(MAX_PLAN_READ_RENDERED_BYTES)
    //#then the effective window is reported and named in a hint
    expect(res.clamped).toBe(true)
    expect(res.limit).toBeGreaterThan(0)
    expect(res.limit).toBeLessThan(1_000_000)
    expect(res.hint).toContain("offset")
  })

  test("the tool description states ceiling semantics, not an absolute barrier", () => {
    //#given the plan_read tool
    //#when its description is read
    const description = tool.description
    //#then the old absolute-barrier phrasing is gone
    expect(description).not.toContain("Hard cap")
    //#then the bypass and its bound are both stated
    expect(description.toLowerCase()).toContain("ceiling")
    expect(description.toLowerCase()).toContain("offset/limit")
  })
})
