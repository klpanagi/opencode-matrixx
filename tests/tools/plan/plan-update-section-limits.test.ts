/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { serializePlanFrontMatter } from "../../../src/features/plan-contract"
import { createPlanUpdateTool } from "../../../src/tools/plan/plan-update"
import {
  buildSectionedPlan,
  hashOf,
  makePlanDir,
  md5OfFile,
  planFile,
  readPlan,
  removePlanDir,
  testContext,
  writePlan,
} from "./plan-update-section-fixtures"

const PLAN_REL = ".matrixx/plans/section-plan.md"

describe("plan_update section-scoped edge cases", () => {
  let testDir: string
  let ctx: ReturnType<typeof testContext>
  const updateTool = createPlanUpdateTool()

  beforeEach(() => {
    testDir = makePlanDir()
    ctx = testContext(testDir)
    writePlan(testDir, "section-plan.md", buildSectionedPlan())
  })

  afterEach(() => {
    removePlanDir(testDir)
  })

  test("prepending to a bare heading is refused and names append as the remedy", async () => {
    //#given a section that is a heading with no body line
    const body = ["# Bare", "", "## TODOs", "## Commit Strategy", "done.", ""].join("\n")
    writePlan(testDir, "bare-plan.md", `${serializePlanFrontMatter({ status: "pending", revision: 1 })}${body}`)
    const path = planFile(testDir, "bare-plan.md")
    const beforeMd5 = md5OfFile(path)

    //#when a prepend is addressed at that heading-only section
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: ".matrixx/plans/bare-plan.md", edits: [{ op: "prepend", section: "todos", lines: ["- [ ] 1. first"] }] },
        ctx,
      ),
    )

    //#then it fails closed instead of landing above the section
    expect(res.error).toBe("validation_error")
    expect(res.message).toContain("append")
    expect(md5OfFile(path)).toBe(beforeMd5)
  })

  test("appending to a bare heading lands under it", async () => {
    //#given the same heading-only section
    const body = ["# Bare", "", "## TODOs", "## Commit Strategy", "done.", ""].join("\n")
    writePlan(testDir, "bare-plan.md", `${serializePlanFrontMatter({ status: "pending", revision: 1 })}${body}`)

    //#when an append is addressed at it
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: ".matrixx/plans/bare-plan.md", edits: [{ op: "append", section: "todos", lines: ["- [ ] 1. first"] }] },
        ctx,
      ),
    )

    //#then the line is the section's only body line
    const lines = readPlan(testDir, "bare-plan.md").split("\n")
    expect(res.success).toBe(true)
    expect(lines[lines.findIndex((line) => line.startsWith("## TODOs")) + 1]).toBe("- [ ] 1. first")
  })

  test("an edit that pushes a LATER section down changes that section's hash too", async () => {
    //#given the pre-edit hash of a section B that sits AFTER the target A
    const before = readPlan(testDir, "section-plan.md")
    const bBefore = hashOf(before, "commit-strategy")
    const aBefore = hashOf(before, "tl-dr")

    //#when section A grows by one line, shifting B down the file
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: PLAN_REL, edits: [{ op: "append", section: "tl-dr", lines: ["A new summary line."] }] },
        ctx,
      ),
    )

    //#then B's hash MOVES as well — the "only the target changed" guarantee holds
    // exactly as far as B's start line not moving, and no further. This is the
    // honest limit of a startLine-bearing hash, not a defect in the write path.
    const after = readPlan(testDir, "section-plan.md")
    expect(res.success).toBe(true)
    expect(hashOf(after, "tl-dr")).not.toBe(aBefore)
    expect(hashOf(after, "commit-strategy")).not.toBe(bBefore)
  })
})
