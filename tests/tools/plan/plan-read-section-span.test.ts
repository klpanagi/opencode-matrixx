/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { PLAN_ERROR_CODES } from "../../../src/tools/plan/error-codes"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"
import { buildSectionIndex } from "../../../src/tools/plan/section-index"
import {
  buildSectionedPlan,
  indexOf,
  makePlanDir,
  removePlanDir,
  testContext,
  writePlan,
} from "./plan-read-section-fixtures"

describe("plan_read section span and anchors", () => {
  let testDir: string
  let tool: ReturnType<typeof createPlanReadTool>

  beforeEach(() => {
    testDir = makePlanDir()
    tool = createPlanReadTool()
  })

  afterEach(() => {
    removePlanDir(testDir)
  })

  test("returns exactly the section span, never the whole file", async () => {
    //#given a plan with five sections
    const content = buildSectionedPlan()
    writePlan(testDir, "sectioned-plan.md", content)
    const entry = indexOf(content, "execution-strategy")

    //#when read with a section selector
    const res = JSON.parse(
      await tool.execute(
        { filePath: ".matrixx/plans/sectioned-plan.md", section: "execution-strategy", format: "content" },
        testContext(testDir),
      ),
    )

    //#then the reported span is the index's span
    expect(res.section.startLine).toBe(entry.startLine)
    expect(res.section.endLine).toBe(entry.endLine)
    //#then the returned line count IS the section's line count — the span-only proof
    expect(res.content.split("\n").length).toBe(entry.endLine - entry.startLine)
    //#then the span is anchored at startLine and no other section leaked in
    expect(entry.startLine).toBe(6)
    expect(res.content.startsWith("## Execution Strategy")).toBe(true)
    expect(res.content).not.toContain("Tldr marker line")
  })

  test("carries the section metadata a later plan_update needs for staleness gating", async () => {
    //#given a plan with a TODOs section
    const content = buildSectionedPlan()
    writePlan(testDir, "sectioned-plan.md", content)
    const entry = indexOf(content, "todos")

    //#when read with a section selector
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/sectioned-plan.md", section: "todos" }, testContext(testDir)),
    )

    //#then every metadata field matches the index, including the contentHash
    expect(res.section).toMatchObject({
      id: "todos",
      level: 2,
      headingText: "TODOs",
      startLine: entry.startLine,
      endLine: entry.endLine,
      bytes: entry.bytes,
      contentHash: entry.contentHash,
    })
    expect(typeof res.section.contentHash).toBe("string")
  })

  test("hashline anchors inside a section are absolute file line numbers", async () => {
    //#given a plan whose section starts at a line greater than 1
    const content = buildSectionedPlan()
    writePlan(testDir, "sectioned-plan.md", content)
    const entry = indexOf(content, "execution-strategy")
    const sourceLines = content.split("\n")

    //#when read as hashline
    const res = JSON.parse(
      await tool.execute(
        { filePath: ".matrixx/plans/sectioned-plan.md", section: "execution-strategy", format: "hashline" },
        testContext(testDir),
      ),
    )

    //#then each anchor number is the REAL line in the file, not section-relative
    const anchors = res.hashline.split("\n").map((line: string) => Number(line.split("#")[0]))
    expect(anchors).toEqual(
      sourceLines.slice(entry.startLine - 1, entry.endLine - 1).map((_line, index) => entry.startLine + index),
    )
    expect(anchors[0]).toBe(entry.startLine)
    expect(res.hashline.split("\n")[0]).toMatch(new RegExp(`^${entry.startLine}#[A-Z]{2}\\|`))
    expect(res.hashline.split("\n")[0]).toContain(sourceLines[entry.startLine - 1])
  })

  test("duplicate H3 headings resolve by 0-based sectionIndex occurrence", async () => {
    //#given a plan with the same H3 spelled twice
    const content = buildSectionedPlan()
    writePlan(testDir, "sectioned-plan.md", content)
    const occurrences = buildSectionIndex(content).filter(
      (entry) => entry.id === "agent-executed-qa-scenarios",
    )
    expect(occurrences.length).toBe(2)

    //#when each occurrence is requested explicitly
    const args = (sectionIndex: number) => ({
      filePath: ".matrixx/plans/sectioned-plan.md",
      section: "agent-executed-qa-scenarios",
      sectionIndex,
      format: "content",
    })
    const first = JSON.parse(await tool.execute(args(0), testContext(testDir)))
    const second = JSON.parse(await tool.execute(args(1), testContext(testDir)))

    //#then each occurrence returns its own distinct span
    expect(first.content).toContain("first occurrence marker")
    expect(second.content).toContain("second occurrence marker")
    expect(first.section.startLine).toBe(occurrences[0].startLine)
    expect(second.section.startLine).toBe(occurrences[1].startLine)
  })

  test("section wins over offset/limit and the effective absolute span is reported", async () => {
    //#given a plan with several sections
    const content = buildSectionedPlan()
    writePlan(testDir, "sectioned-plan.md", content)
    const entry = indexOf(content, "todos")

    //#when read with a section AND file-level pagination
    const res = JSON.parse(
      await tool.execute(
        {
          filePath: ".matrixx/plans/sectioned-plan.md",
          section: "todos",
          offset: 1,
          limit: 99,
          format: "content",
        },
        testContext(testDir),
      ),
    )

    //#then the section is the base span and the reported lines are absolute
    expect(res.precedence).toBe("section")
    expect(res.section.startLine).toBe(entry.startLine)
    expect(res.startLine).toBe(entry.startLine)
    expect(res.endLine).toBe(entry.endLine)
    expect(res.content).not.toContain("Tldr marker line")
  })

  test("a plain whole-file read is unchanged and carries no section key", async () => {
    //#given a small plan
    writePlan(testDir, "plain-plan.md", buildSectionedPlan())

    //#when read with no section selector
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/plain-plan.md", format: "content" }, testContext(testDir)),
    )

    //#then the legacy payload shape is untouched
    expect("section" in res).toBe(false)
    expect("precedence" in res).toBe(false)
    expect(res.content).toContain("# Section Fixture")
  })

  test("a duplicated section without sectionIndex fails closed and names the valid range", async () => {
    //#given a plan with a duplicated H3 and no sectionIndex
    const content = buildSectionedPlan()
    writePlan(testDir, "sectioned-plan.md", content)

    //#when read by that selector
    const res = JSON.parse(
      await tool.execute(
        { filePath: ".matrixx/plans/sectioned-plan.md", section: "agent-executed-qa-scenarios" },
        testContext(testDir),
      ),
    )

    //#then it is a validation_error naming the selector and the 0-based range
    expect(res.error).toBe(PLAN_ERROR_CODES.validationError)
    expect(res.argument).toBe("section")
    expect(res.message).toContain("agent-executed-qa-scenarios")
    expect(res.message).toContain("sectionIndex")
    expect(res.message).toContain("0")
    expect(res.message).toContain("1")
    expect("content" in res).toBe(false)
    expect("hashline" in res).toBe(false)
  })
})
