/// <reference types="bun-types" />
/**
 * Task 12 — the CORRUPTION CONTROL.
 *
 * Without this test the rest of the byte-equality suite proves nothing: a writer
 * that silently ignored `contentHash` would pass every "untouched section is
 * byte-identical" assertion while happily clobbering a section that had changed
 * since it was read. The gate must REJECT a wrong hash AND leave the file's
 * bytes exactly as they were.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createPlanUpdateTool } from "../../../src/tools/plan/plan-update"
import { buildSectionIndex } from "../../../src/tools/plan/section-index"
import {
  makePlanDir,
  md5OfFile,
  planFile,
  readPlan,
  removePlanDir,
  testContext,
  writePlan,
} from "./plan-update-section-fixtures"
import { buildProofPlan, PROOF_PLAN_NAME, PROOF_PLAN_REL } from "./plan-section-proof-fixture"

function hashOfSection(content: string, id: string): string {
  const entry = buildSectionIndex(content).find((candidate) => candidate.id === id)
  if (!entry) throw new Error(`fixture lost the section "${id}"`)
  return entry.contentHash
}

describe("section write refuses a wrong contentHash", () => {
  let testDir: string
  let ctx: ReturnType<typeof testContext>
  const updateTool = createPlanUpdateTool()

  beforeEach(() => {
    testDir = makePlanDir()
    ctx = testContext(testDir)
    writePlan(testDir, PROOF_PLAN_NAME, buildProofPlan())
  })

  afterEach(() => {
    removePlanDir(testDir)
  })

  test("a deliberately corrupted contentHash is rejected with section_stale and the file is byte-unchanged", async () => {
    //#given a real section read, then its hash DELIBERATELY corrupted by one hex digit
    const path = planFile(testDir, PROOF_PLAN_NAME)
    const md5Before = md5OfFile(path)
    const bytesBefore = readPlan(testDir, PROOF_PLAN_NAME)
    const real = hashOfSection(bytesBefore, "execution-strategy")
    const corrupted = `${real.slice(0, 15)}${real[15] === "0" ? "1" : "0"}`
    expect(corrupted).not.toBe(real)

    //#when the caller submits a gated section-scoped append carrying that bad hash
    const res = JSON.parse(
      await updateTool.execute(
        {
          filePath: PROOF_PLAN_REL,
          edits: [{ op: "append", section: "Execution Strategy", contentHash: corrupted, lines: ["This line must never be written."] }],
        },
        ctx,
      ),
    )

    //#then the write is refused, BOTH hashes are named, and md5sum is unchanged
    expect(res.success).toBeUndefined()
    expect(res.error).toBe("section_stale")
    expect(res.expectedHash).toBe(corrupted)
    expect(res.actualHash).toBe(real)
    expect(md5OfFile(path)).toBe(md5Before)
    expect(readPlan(testDir, PROOF_PLAN_NAME)).toBe(bytesBefore)
  })

  test("a hash that is byte-correct at read time is accepted — the control is not refusing everything", async () => {
    //#given the section's own current contentHash
    const path = planFile(testDir, PROOF_PLAN_NAME)
    const md5Before = md5OfFile(path)
    const bytesBefore = readPlan(testDir, PROOF_PLAN_NAME)
    const real = hashOfSection(bytesBefore, "execution-strategy")

    //#when the same op is submitted with the TRUE hash
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: PROOF_PLAN_REL, edits: [{ op: "append", section: "Execution Strategy", contentHash: real, lines: ["Control: the true hash passes."] }] },
        ctx,
      ),
    )

    //#then the write lands and md5sum moved — the gate discriminates
    expect(res.success).toBe(true)
    expect(md5OfFile(path)).not.toBe(md5Before)
    expect(readPlan(testDir, PROOF_PLAN_NAME)).not.toBe(bytesBefore)
  })
})
