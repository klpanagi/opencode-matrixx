/// <reference types="bun-types" />
/**
 * Task 12 — byte-equality proof for the section WRITE path.
 *
 * The claim under test: a section-scoped write is LOSSLESS outside its target
 * span. "Lossless" here means BYTE-IDENTICAL, so every assertion below compares
 * exact text slices or hashes — never `toContain`.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"
import { createPlanUpdateTool } from "../../../src/tools/plan/plan-update"
import { buildSectionIndex } from "../../../src/tools/plan/section-index"
import type { PlanSectionIndexEntry } from "../../../src/tools/plan/types"
import {
  anchorIn,
  md5OfFile,
  makePlanDir,
  planFile,
  readPlan,
  removePlanDir,
  testContext,
  writePlan,
} from "./plan-update-section-fixtures"
import {
  buildProofPlan,
  originalSlice,
  PROOF_PLAN_NAME,
  PROOF_PLAN_REL,
} from "./plan-section-proof-fixture"

/** Top-level (H2) entries only — H3 spans nest INSIDE their parent, so summing
 * every entry's `bytes` double-counts. See `section-index.ts` NESTING. */
function topLevel(content: string): PlanSectionIndexEntry[] {
  return buildSectionIndex(content).filter((entry) => entry.level === 2)
}

/** Raw text of every H2 section, keyed by id — the byte-level oracle. */
function rawSectionTexts(content: string): Record<string, string> {
  return Object.fromEntries(topLevel(content).map((entry) => [entry.id, originalSlice(content, entry.startLine, entry.endLine)]))
}

describe("section write is lossless outside its target span", () => {
  let testDir: string
  let ctx: ReturnType<typeof testContext>
  const readTool = createPlanReadTool()
  const updateTool = createPlanUpdateTool()

  beforeEach(() => {
    testDir = makePlanDir()
    ctx = testContext(testDir)
    writePlan(testDir, PROOF_PLAN_NAME, buildProofPlan())
  })

  afterEach(() => {
    removePlanDir(testDir)
  })

  async function readSection(selector: string, format: "hashline" | "content") {
    return JSON.parse(await readTool.execute({ filePath: PROOF_PLAN_REL, section: selector, format }, ctx))
  }

  test("a section-scoped append to the LAST section leaves every PRECEDING section byte-identical", async () => {
    //#given the whole-file md5, every top-level contentHash, and every section's raw text
    const path = planFile(testDir, PROOF_PLAN_NAME)
    const before = readPlan(testDir, PROOF_PLAN_NAME)
    const md5Before = md5OfFile(path)
    const hashesBefore = Object.fromEntries(topLevel(before).map((entry) => [entry.id, entry.contentHash]))
    const textBefore = rawSectionTexts(before)
    const last = topLevel(before)[topLevel(before).length - 1] as PlanSectionIndexEntry
    expect(last.id).toBe("success-criteria")

    //#when a gated append lands in that last section
    const res = JSON.parse(
      await updateTool.execute(
        {
          filePath: PROOF_PLAN_REL,
          edits: [{ op: "append", section: "Success Criteria", contentHash: last.contentHash, lines: ["Zero sections outside the span moved."] }],
        },
        ctx,
      ),
    )

    //#then the write succeeded, the file's md5 moved, and every other section is byte-identical
    const after = readPlan(testDir, PROOF_PLAN_NAME)
    const hashesAfter = Object.fromEntries(topLevel(after).map((entry) => [entry.id, entry.contentHash]))
    const textAfter = rawSectionTexts(after)
    expect(res.success).toBe(true)
    expect(md5OfFile(path)).not.toBe(md5Before)
    expect(hashesAfter["success-criteria"]).not.toBe(hashesBefore["success-criteria"])
    for (const entry of topLevel(before).slice(0, -1)) {
      // A contentHash is a POSITION-SENSITIVE proxy for byte-equality (it folds
      // startLine in). Here the edit is after every one of these sections, so no
      // line above moved and the hash MUST be unchanged — and the raw text is
      // asserted too, because "the hash is unchanged" on its own is a proxy.
      expect(hashesAfter[entry.id]).toBe(hashesBefore[entry.id] )
      expect(textAfter[entry.id]).toBe(textBefore[entry.id] )
    }
  })

  test("a section-scoped prepend to the FIRST section leaves every FOLLOWING section byte-identical", async () => {
    //#given the pre-edit raw text and startLines of every section
    const before = readPlan(testDir, PROOF_PLAN_NAME)
    const textBefore = rawSectionTexts(before)
    const startsBefore = Object.fromEntries(topLevel(before).map((entry) => [entry.id, entry.startLine]))
    const first = topLevel(before)[0] as PlanSectionIndexEntry
    expect(first.id).toBe("tl-dr")

    //#when a gated prepend lands under the first section's heading
    const res = JSON.parse(
      await updateTool.execute(
        {
          filePath: PROOF_PLAN_REL,
          edits: [{ op: "prepend", section: "TL;DR", contentHash: first.contentHash, lines: ["Canary line inserted at the very top."] }],
        },
        ctx,
      ),
    )

    //#then every following section's RAW TEXT is byte-identical and its startLine
    //     shifted by exactly the one line that was inserted (position-sensitive
    //     hashing means the contentHashes of the FOLLOWING sections necessarily
    //     move here — asserting them unchanged would be asserting a falsehood)
    const after = readPlan(testDir, PROOF_PLAN_NAME)
    const textAfter = rawSectionTexts(after)
    const startsAfter = Object.fromEntries(topLevel(after).map((entry) => [entry.id, entry.startLine]))
    expect(res.success).toBe(true)
    for (const entry of topLevel(before).slice(1)) {
      expect(textAfter[entry.id]).toBe(textBefore[entry.id] )
      expect(startsAfter[entry.id]).toBe((startsBefore[entry.id] as number) + 1)
    }
  })

  test("the legacy hashline path and the section path produce identical bytes for the same logical change", async () => {
    //#given the SAME fixture in two sibling projects, and the absolute anchor of one line
    const legacyDir = makePlanDir()
    const sectionDir = makePlanDir()
    try {
      writePlan(legacyDir, PROOF_PLAN_NAME, buildProofPlan())
      writePlan(sectionDir, PROOF_PLAN_NAME, buildProofPlan())
      const legacyCtx = testContext(legacyDir)
      const sectionCtx = testContext(sectionDir)
      const read = await readSection("Execution Strategy", "hashline")
      const pos = anchorIn(read.hashline as string, "Wave 1 does the read path.")

      //#when the identical one-line change is made via the legacy whole-file path
      //     and via the section path, from two byte-identical starting files
      const legacyRes = JSON.parse(
        await updateTool.execute({ filePath: PROOF_PLAN_REL, edits: [{ op: "replace", pos, lines: ["Wave 1 does the read path EDITED."] }] }, legacyCtx),
      )
      const sectionRes = JSON.parse(
        await updateTool.execute(
          {
            filePath: PROOF_PLAN_REL,
            edits: [{ op: "replace", section: "Execution Strategy", contentHash: read.section.contentHash, pos, lines: ["Wave 1 does the read path EDITED."] }],
          },
          sectionCtx,
        ),
      )

      //#then the two files agree byte for byte — the section path adds no
      //      normalization the legacy path does not also perform
      const legacyBytes = readPlan(legacyDir, PROOF_PLAN_NAME)
      const sectionBytes = readPlan(sectionDir, PROOF_PLAN_NAME)
      expect(legacyRes.success).toBe(true)
      expect(sectionRes.success).toBe(true)
      expect(md5OfFile(planFile(sectionDir, PROOF_PLAN_NAME))).toBe(md5OfFile(planFile(legacyDir, PROOF_PLAN_NAME)))
      expect(sectionBytes).toBe(legacyBytes)
      expect(rawSectionTexts(sectionBytes)).toEqual(rawSectionTexts(legacyBytes))
    } finally {
      removePlanDir(legacyDir)
      removePlanDir(sectionDir)
    }
  })
})
