/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { serializePlanFrontMatter } from "../../../src/features/plan-contract"
import { createPlanUpdateTool } from "../../../src/tools/plan/plan-update"
import {
  makePlanDir,
  planFile,
  readPlan,
  removePlanDir,
  testContext,
  writePlan,
} from "./plan-update-section-fixtures"

const PLAN_REL = ".matrixx/plans/mismatch-plan.md"
const MISMATCH_BODY = ["# Mismatch Fixture", "", "- [ ] 1. unfinished work", ""].join("\n")

describe("plan_update warn-only completion mismatch (Task 6)", () => {
  let testDir: string
  let ctx: ReturnType<typeof testContext>
  const updateTool = createPlanUpdateTool()

  beforeEach(() => {
    testDir = makePlanDir()
    ctx = testContext(testDir)
    writePlan(
      testDir,
      "mismatch-plan.md",
      `${serializePlanFrontMatter({ status: "completed", revision: 1 })}${MISMATCH_BODY}`,
    )
  })

  afterEach(() => {
    removePlanDir(testDir)
  })

  test("mismatched plan returns success + completionWarning, never blocks", async () => {
    //#given a plan whose front-matter says completed but boxes are unchecked
    const path = planFile(testDir, "mismatch-plan.md")

    //#when a normal edit lands on the mismatched plan
    const res = JSON.parse(
      await updateTool.execute({ filePath: PLAN_REL, edits: [{ op: "append", lines: ["Trailing note."] }] }, ctx),
    )

    //#then the write succeeds (warn-only) and carries a fix hint
    expect(res.error).toBeUndefined()
    expect(res.success).toBe(true)
    expect(res.completionWarning).toBeDefined()
    expect(res.completionWarning.mismatch).toBe(true)
    expect(res.completionWarning.message).toContain("plan_update")
    expect(readPlan(testDir, "mismatch-plan.md")).toContain("Trailing note.")
    void path
  })

  test("matching plan carries no completionWarning", async () => {
    //#given a plan whose status agrees with its boxes
    writePlan(
      testDir,
      "mismatch-plan.md",
      `${serializePlanFrontMatter({ status: "pending", revision: 1 })}${MISMATCH_BODY}`,
    )

    //#when a normal edit lands on the matching plan
    const res = JSON.parse(
      await updateTool.execute({ filePath: PLAN_REL, edits: [{ op: "append", lines: ["Trailing note."] }] }, ctx),
    )

    //#then the write succeeds with no warning attached
    expect(res.error).toBeUndefined()
    expect(res.success).toBe(true)
    expect(res.completionWarning).toBeUndefined()
  })
})
