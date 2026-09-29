/// <reference types="bun-types" />
/**
 * Task 12 — the ROUND-TRIP CANARY.
 *
 * `plan_read(section, format:"content")` must return the file's ORIGINAL line
 * slice `[startLine, endLine)` and nothing else. If any layer ever parsed the
 * markdown to an AST and re-stringified it with `mdast-util-to-markdown`, the
 * payload would still be valid markdown — just different bytes: table padding
 * normalized, trailing hard-break spaces stripped, `\*` de-escaped, list
 * markers renumbered. Every `bytes` and `contentHash` derived from it would then
 * describe a document that never existed on disk. The fixture's canary H3
 * carries a pipe table, a doubled trailing-space hard break, an escaped
 * backslash-star and a literal double backslash — exactly the constructs a lossy
 * serializer mangles.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"
import { buildSectionIndex } from "../../../src/tools/plan/section-index"
import { makePlanDir, readPlan, removePlanDir, testContext, writePlan } from "./plan-update-section-fixtures"
import { buildProofPlan, originalSlice, PROOF_PLAN_NAME, PROOF_PLAN_REL } from "./plan-section-proof-fixture"

describe("plan_read section content round-trips to the exact original slice", () => {
  let testDir: string
  let ctx: ReturnType<typeof testContext>
  const readTool = createPlanReadTool()

  beforeEach(() => {
    testDir = makePlanDir()
    ctx = testContext(testDir)
    writePlan(testDir, PROOF_PLAN_NAME, buildProofPlan())
  })

  afterEach(() => {
    removePlanDir(testDir)
  })

  async function readContent(selector: string) {
    return JSON.parse(await readTool.execute({ filePath: PROOF_PLAN_REL, section: selector, format: "content" }, ctx))
  }

  test("the canary section round-trips byte-for-byte: table, escaped chars, trailing spaces intact", async () => {
    //#given the on-disk bytes of the fixture
    const onDisk = readPlan(testDir, PROOF_PLAN_NAME)

    //#when the canary H3 is read in content format
    const res = await readContent("Canary Table")
    const entry = buildSectionIndex(onDisk).find((candidate) => candidate.id === "canary-table") as (ReturnType<typeof buildSectionIndex>)[number]

    //#then the payload IS the file's [startLine, endLine) slice, character for character
    expect(res.content).toBe(originalSlice(onDisk, res.startLine, res.endLine))
    expect(res.startLine).toBe(entry?.startLine)
    expect(res.endLine).toBe(entry?.endLine)
    // the specific canary constructs, asserted as exact substrings of the file's own lines
    expect(res.content).toBe(onDisk.split("\n").slice(res.startLine - 1, res.endLine - 1).join("\n"))
    expect(res.content).toContain("| `escaped \\* star` | value |")
    expect(res.content).toContain("| backslash \\\\ literal | value |")
    // the section span runs to the next H2, so it carries the trailing blank
    // line too — the doubled spaces survive on the line before it
    expect(res.content).toContain("Hard break follows.  \n")
    expect(res.content.endsWith("Hard break follows.  \n")).toBe(true)
    expect(res.content).not.toContain("Hard break follows.\n")
  })

  test("every section of the fixture round-trips to its own exact original slice", async () => {
    //#given the index of the untouched fixture
    const onDisk = readPlan(testDir, PROOF_PLAN_NAME)
    const entries = buildSectionIndex(onDisk)
    expect(entries.length).toBeGreaterThan(0)

    //#when each section is read in content format by its own id
    for (const entry of entries) {
      const res = await readContent(entry.id)
      //#then the payload equals the original slice, for all of them
      expect(res.content).toBe(originalSlice(onDisk, entry.startLine, entry.endLine))
      expect(res.startLine).toBe(entry.startLine)
      expect(res.endLine).toBe(entry.endLine)
    }
  })

  test("the hashline payload of a section is the same lines with absolute anchors", async () => {
    //#given the canary section's original lines
    const onDisk = readPlan(testDir, PROOF_PLAN_NAME)
    const content = await readContent("Canary Table")

    //#when the same section is read in hashline format
    const res = JSON.parse(await readTool.execute({ filePath: PROOF_PLAN_REL, section: "Canary Table", format: "hashline" }, ctx))

    //#then stripping the N#ID prefixes reproduces the identical text
    const stripped = (res.hashline as string)
      .split("\n")
      .map((row: string) => row.slice(row.indexOf("|") + 1))
      .join("\n")
    expect(stripped).toBe(content.content)
  })
})
