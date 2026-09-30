/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createPlanUpdateTool } from "../../../src/tools/plan/plan-update"
import {
  buildSectionedPlan,
  makePlanDir,
  md5OfFile,
  planFile,
  readPlan,
  removePlanDir,
  testContext,
  writePlan,
} from "./plan-update-section-fixtures"

const PLAN_REL = ".matrixx/plans/section-plan.md"
const MISTAKEN_FIELDS = ["section", "sectionIndex", "contentHash"] as const

describe("plan_update rejects section/contentHash at the top level", () => {
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

  for (const field of MISTAKEN_FIELDS) {
    test(`a top-level ${field} is a validation_error and nothing is written`, async () => {
      //#given a plan on disk and a misplaced field at the TOP level of the args
      const path = planFile(testDir, "section-plan.md")
      const beforeMd5 = md5OfFile(path)
      const value = field === "sectionIndex" ? 0 : field === "contentHash" ? "deadbeefdeadbeef" : "todos"

      //#when the caller submits it outside the edit object
      const res = JSON.parse(
        await updateTool.execute(
          { filePath: PLAN_REL, [field]: value, edits: [{ op: "append", lines: ["- [ ] misplaced"] }] },
          ctx,
        ),
      )

      //#then the silently-ungated write is refused, naming the field and the correct shape
      expect(res.success).toBeUndefined()
      expect(res.error).toBe("validation_error")
      expect(res.message).toContain(field)
      expect(res.message).toContain("edits[")
      expect(md5OfFile(path)).toBe(beforeMd5)
      expect(readPlan(testDir, "section-plan.md")).not.toContain("misplaced")
    })
  }

  test("a top-level contentHash is refused even when a stale write would otherwise have succeeded", async () => {
    //#given the exact ungated-write shape from the defect report
    const beforeMd5 = md5OfFile(planFile(testDir, "section-plan.md"))

    //#when section AND contentHash sit at the top level while edits[] names no section
    const res = JSON.parse(
      await updateTool.execute(
        {
          filePath: PLAN_REL,
          section: "todos",
          contentHash: "deadbeefdeadbeef",
          edits: [{ op: "append", lines: ["- [ ] 3. nope"] }],
        },
        ctx,
      ),
    )

    //#then the stale-hash gate is not silently skipped — the call is refused up front
    expect(res.error).toBe("validation_error")
    expect(res.message).toContain("section")
    expect(res.message).toContain("contentHash")
    expect(md5OfFile(planFile(testDir, "section-plan.md"))).toBe(beforeMd5)
  })

  test("the same call with the fields INSIDE the edit is unaffected", async () => {
    //#given the correctly-shaped equivalent
    const beforeMd5 = md5OfFile(planFile(testDir, "section-plan.md"))

    //#when section + contentHash live on the edit object
    const res = JSON.parse(
      await updateTool.execute(
        {
          filePath: PLAN_REL,
          edits: [{ op: "append", section: "todos", contentHash: "deadbeefdeadbeef", lines: ["- [ ] 3. STALE"] }],
        },
        ctx,
      ),
    )

    //#then it is the section_stale refusal, not the new argument guard
    expect(res.error).toBe("section_stale")
    expect(md5OfFile(planFile(testDir, "section-plan.md"))).toBe(beforeMd5)
  })

  test("omitting all three at the top level keeps working", async () => {
    //#given a plain non-section edit
    const beforeMd5 = md5OfFile(planFile(testDir, "section-plan.md"))

    //#when it is submitted
    const res = JSON.parse(await updateTool.execute({ filePath: PLAN_REL, edits: [{ op: "append", lines: ["plain tail"] }] }, ctx))

    //#then it succeeds and the file changes
    expect(res.error).toBeUndefined()
    expect(res.success).toBe(true)
    expect(md5OfFile(planFile(testDir, "section-plan.md"))).not.toBe(beforeMd5)
  })
})
