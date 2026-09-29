/// <reference types="bun-types" />
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { MAX_PLAN_FILE_BYTES, measurePlanBytes } from "../../../src/features/mission-state/constants"
import { createPlanUpdateTool } from "../../../src/tools/plan/plan-update"
import { buildSectionedPlan, makePlanDir, md5OfFile, planFile, readPlan, removePlanDir, testContext, writePlan } from "./plan-update-section-fixtures"

/**
 * Task 11 — the apply -> cap-check window.
 *
 * The plan write path is guarded by ONE cap-check-and-rollback, and a throw in
 * the window between "the edit is on disk" and "the cap is enforced" must leave
 * the file byte-for-byte as it was. `md5` is the assertion, not "no error
 * surfaced": a handler that swallowed the fault without restoring would pass a
 * weaker test and still ship a mutated plan.
 */
const PLAN_REL = ".matrixx/plans/section-plan.md"

const APPEND_TODOS = { op: "append" as const, section: "todos", lines: ["- [ ] 3. injected line"] }

function tmpResidue(testDir: string): string[] {
  return readdirSync(join(testDir, ".matrixx/plans")).filter((name) => name.includes(".tmp."))
}

describe("plan_update crash-safe cap window", () => {
  let testDir: string
  let ctx: ReturnType<typeof testContext>

  beforeEach(() => {
    testDir = makePlanDir()
    ctx = testContext(testDir)
    writePlan(testDir, "section-plan.md", buildSectionedPlan())
  })

  afterEach(() => {
    removePlanDir(testDir)
  })

  test("a throw between the apply and the cap check restores the file byte-for-byte", async () => {
    //#given a plan whose edit is applied to disk before the cap is ever checked
    const path = planFile(testDir, "section-plan.md")
    const before = readPlan(testDir, "section-plan.md")
    const beforeMd5 = md5OfFile(path)
    const tool = createPlanUpdateTool(undefined, () => {
      throw new Error("injected fault between apply and cap check")
    })

    //#when the fault fires in that window
    const raw = await tool.execute({ filePath: PLAN_REL, edits: [APPEND_TODOS] }, ctx)
    const res = JSON.parse(raw)

    //#then the on-disk bytes are EXACTLY the pre-edit bytes — not merely "no crash"
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, "utf-8")).toBe(before)
    expect(md5OfFile(path)).toBe(beforeMd5)
    expect(res.error).toBe("internal_error")
    expect(res.message).toContain("injected fault")
    //#and the restore left no .tmp residue behind
    expect(tmpResidue(testDir)).toEqual([])
  })

  test("the finally does not undo a successful write", async () => {
    //#given the same window with a hook that returns normally
    const path = planFile(testDir, "section-plan.md")
    const before = readPlan(testDir, "section-plan.md")
    const beforeMd5 = md5OfFile(path)
    let hookRan = false
    const tool = createPlanUpdateTool(undefined, () => {
      hookRan = true
    })

    //#when the update runs to completion
    const res = JSON.parse(await tool.execute({ filePath: PLAN_REL, edits: [APPEND_TODOS] }, ctx))

    //#then the edit is persisted — the guard must not roll a committed write back
    expect(hookRan).toBe(true)
    expect(res.success).toBe(true)
    const after = readPlan(testDir, "section-plan.md")
    expect(after).not.toBe(before)
    expect(after).toContain("- [ ] 3. injected line")
    expect(md5OfFile(path)).not.toBe(beforeMd5)
    expect(tmpResidue(testDir)).toEqual([])
  })

  test("an over-cap edit is rolled back with no .tmp residue", async () => {
    //#given a plan a single edit pushes past the cap
    const filler = "b".repeat(400)
    const big = readPlan(testDir, "section-plan.md")
    writeFileSync(planFile(testDir, "big-plan.md"), big, "utf-8")
    //#and grow it with one huge section append
    const overCap = "c".repeat(MAX_PLAN_FILE_BYTES + 1)
    expect(measurePlanBytes(overCap)).toBeGreaterThan(MAX_PLAN_FILE_BYTES)

    //#when the append lands
    const res = JSON.parse(
      await createPlanUpdateTool().execute(
        { filePath: ".matrixx/plans/big-plan.md", edits: [{ op: "append", section: "todos", lines: [filler, overCap] }] },
        ctx,
      ),
    )

    //#then the write is refused and the file is byte-identical to before
    expect(res.error).toBe("size_exceeded")
    expect(md5OfFile(planFile(testDir, "big-plan.md"))).toBe(md5OfFile(planFile(testDir, "section-plan.md")))
    expect(tmpResidue(testDir)).toEqual([])
  })

  test("the cap re-check measures bytes, not UTF-16 length", async () => {
    //#given a plan written in 2-byte characters: its .length sits far below the cap
    const wide = "é".repeat(Math.floor((MAX_PLAN_FILE_BYTES - 64) / 2))
    const body = ["# Wide", "", "## TODOs", "- [ ] 1. wide", ""].join("\n")
    const content = `${wide}\n${body}`
    expect(content.length).toBeLessThan(MAX_PLAN_FILE_BYTES)
    expect(measurePlanBytes(content)).toBeLessThan(MAX_PLAN_FILE_BYTES)
    writeFileSync(planFile(testDir, "wide-plan.md"), content, "utf-8")
    const beforeMd5 = md5OfFile(planFile(testDir, "wide-plan.md"))

    //#when an edit adds 2-byte characters that cross the cap only in bytes
    const res = JSON.parse(
      await createPlanUpdateTool().execute(
        { filePath: ".matrixx/plans/wide-plan.md", edits: [{ op: "append", section: "todos", lines: ["é".repeat(64)] }] },
        ctx,
      ),
    )

    //#then the byte ruler — not .length — refused it
    expect(res.error).toBe("size_exceeded")
    expect(md5OfFile(planFile(testDir, "wide-plan.md"))).toBe(beforeMd5)
    expect(tmpResidue(testDir)).toEqual([])
  })
})
