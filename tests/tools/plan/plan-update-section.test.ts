/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"
import { createPlanUpdateTool } from "../../../src/tools/plan/plan-update"
import {
  allHashes,
  anchorIn,
  buildSectionedPlan,
  hashOf,
  makePlanDir,
  planFile,
  readPlan,
  removePlanDir,
  testContext,
  writePlan,
} from "./plan-update-section-fixtures"

const PLAN_REL = ".matrixx/plans/section-plan.md"

describe("plan_update section-scoped edits", () => {
  let testDir: string
  let ctx: ReturnType<typeof testContext>
  const readTool = createPlanReadTool()
  const updateTool = createPlanUpdateTool()

  beforeEach(() => {
    testDir = makePlanDir()
    ctx = testContext(testDir)
    writePlan(testDir, "section-plan.md", buildSectionedPlan())
  })

  afterEach(() => {
    removePlanDir(testDir)
  })

  async function readSectionHash(selector: string): Promise<{ hash: string; hashline: string }> {
    const res = JSON.parse(await readTool.execute({ filePath: PLAN_REL, section: selector, format: "hashline" }, ctx))
    return { hash: res.section.contentHash as string, hashline: res.hashline as string }
  }

  test("section-scoped replace rewrites only the named section", async () => {
    //#given a section read whose contentHash and absolute anchors the caller holds
    const before = readPlan(testDir, "section-plan.md")
    const { hash, hashline } = await readSectionHash("execution-strategy")
    const pos = anchorIn(hashline, "Strategy body one.")

    //#when the caller replaces a line inside that section, gated on the hash
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: PLAN_REL, edits: [{ op: "replace", section: "execution-strategy", contentHash: hash, pos, lines: ["Strategy body one EDITED."] }] },
        ctx,
      ),
    )

    //#then the write lands and the rest of the file is untouched
    const after = readPlan(testDir, "section-plan.md")
    expect(res.success).toBe(true)
    expect(res.error).toBeUndefined()
    expect(after).toContain("Strategy body one EDITED.")
    expect(after).toContain("Strategy body two.")
    expect(hashOf(after, "execution-strategy")).not.toBe(hash)
  })

  test("an edit to section A leaves every other section's contentHash byte-identical", async () => {
    //#given the pre-edit hash of a section B that sits after the target A
    const before = readPlan(testDir, "section-plan.md")
    const beforeHashes = allHashes(before)
    const { hash, hashline } = await readSectionHash("execution-strategy")
    const pos = anchorIn(hashline, "Strategy body one.")

    //#when a line-count-preserving replace lands inside section A
    await updateTool.execute(
      { filePath: PLAN_REL, edits: [{ op: "replace", section: "execution-strategy", contentHash: hash, pos, lines: ["Strategy body one EDITED."] }] },
      ctx,
    )

    //#then only A's hash moved; B (and every other section) is byte-identical
    const afterHashes = allHashes(readPlan(testDir, "section-plan.md"))
    expect(afterHashes["execution-strategy"]).not.toBe(beforeHashes["execution-strategy"])
    expect(afterHashes["commit-strategy"]).toBe(beforeHashes["commit-strategy"])
    expect(afterHashes["todos"]).toBe(beforeHashes["todos"])
    expect(afterHashes["tl-dr"]).toBe(beforeHashes["tl-dr"])
  })

  test("section-scoped append without pos anchors at the section end", async () => {
    //#given a section read, with no pos supplied on the edit
    const { hash } = await readSectionHash("execution-strategy")

    //#when an append with no pos is submitted against the section id
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: PLAN_REL, edits: [{ op: "append", section: "execution-strategy", contentHash: hash, lines: ["Strategy body three."] }] },
        ctx,
      ),
    )

    //#then the line lands after the section's last body line and before the next heading
    const after = readPlan(testDir, "section-plan.md")
    expect(res.success).toBe(true)
    const lines = after.split("\n")
    const body = lines.findIndex((line) => line === "Strategy body three.")
    expect(body).toBeGreaterThan(lines.findIndex((line) => line === "Strategy body two."))
    expect(body).toBeLessThan(lines.findIndex((line) => line.startsWith("## TODOs")))
  })

  test("section-scoped prepend without pos anchors at the section start", async () => {
    //#given a section read, with no pos supplied on the edit
    const { hash } = await readSectionHash("todos")

    //#when a prepend with no pos is submitted against the section id
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: PLAN_REL, edits: [{ op: "prepend", section: "todos", contentHash: hash, lines: ["- [ ] 0. injected task"] }] },
        ctx,
      ),
    )

    //#then the line is the section's first body line, directly under its heading
    const lines = readPlan(testDir, "section-plan.md").split("\n")
    expect(res.success).toBe(true)
    const heading = lines.findIndex((line) => line.startsWith("## TODOs"))
    expect(lines[heading + 1]).toBe("- [ ] 0. injected task")
  })

  test("a section-scoped write reports the recomputed section hashes", async () => {
    //#given a gated append
    const { hash } = await readSectionHash("commit-strategy")

    //#when it lands
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: PLAN_REL, edits: [{ op: "append", section: "commit-strategy", contentHash: hash, lines: ["Squash stays disabled."] }] },
        ctx,
      ),
    )

    //#then the response carries the post-write hash of the edited section
    const after = readPlan(testDir, "section-plan.md")
    expect(res.success).toBe(true)
    expect(res.section.contentHash).toBe(hashOf(after, "commit-strategy"))
    expect(res.section.contentHash).not.toBe(hash)
    expect(res.section.startLine).toBeGreaterThan(0)
  })

  test("a section-scoped write never edits outside the named section's span", async () => {
    //#given a pos anchor that points into a DIFFERENT section
    const { hashline } = await readSectionHash("tl-dr")
    const foreign = anchorIn(hashline, "Tldr marker line.")

    //#when the caller claims that anchor belongs to the TODOs section
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: PLAN_REL, edits: [{ op: "replace", section: "todos", pos: foreign, lines: ["hijacked"] }] },
        ctx,
      ),
    )

    //#then the edit is refused and the file is byte-unchanged
    const before = readPlan(testDir, "section-plan.md")
    expect(res.error).toBe("validation_error")
    expect(res.message).toContain("todos")
    expect(readPlan(testDir, "section-plan.md")).toBe(before)
  })

  test("the non-section path is unchanged when a call carries no section", async () => {
    //#given a whole-file anchor
    const { hashline } = await readSectionHash("tl-dr")
    const pos = anchorIn(hashline, "Tldr marker line.")
    const path = planFile(testDir, "section-plan.md")

    //#when a plain hashline replace is submitted
    const res = JSON.parse(
      await updateTool.execute({ filePath: PLAN_REL, edits: [{ op: "replace", pos, lines: ["Tldr replaced."] }] }, ctx),
    )

    //#then it applies and reports no section metadata
    expect(res.success).toBe(true)
    expect(res.section).toBeUndefined()
    expect(res.message).toContain(path)
  })
})
