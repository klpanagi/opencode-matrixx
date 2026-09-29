/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { MAX_PLAN_FILE_BYTES } from "../../../src/features/mission-state/constants"
import { buildUnderCapBody } from "../../fixtures/plan-fixtures"
import { serializePlanFrontMatter } from "../../../src/features/plan-contract"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"
import { createPlanUpdateTool } from "../../../src/tools/plan/plan-update"
import {
  anchorIn,
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

describe("plan_update section guards", () => {
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

  async function readSection(selector: string) {
    const res = JSON.parse(await readTool.execute({ filePath: PLAN_REL, section: selector, format: "hashline" }, ctx))
    return res as { section: { contentHash: string }; hashline: string; error?: string }
  }

  test("a stale contentHash is refused with section_stale and the file is byte-unchanged", async () => {
    //#given a hash captured before the section was mutated by a DIFFERENT means
    const stale = (await readSection("commit-strategy")).section.contentHash
    const path = planFile(testDir, "section-plan.md")
    writePlan(testDir, "section-plan.md", readPlan(testDir, "section-plan.md").replace("Merge commit only.", "Squash is forbidden."))
    const afterMutation = md5OfFile(path)

    //#when the caller writes with the now-stale hash
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: PLAN_REL, edits: [{ op: "append", section: "commit-strategy", contentHash: stale, lines: ["extra"] }] },
        ctx,
      ),
    )

    //#then it fails closed, naming BOTH hashes, and never writes
    expect(res.error).toBe("section_stale")
    expect(res.message).toContain(stale)
    expect(res.message).toMatch(/[0-9a-f]{16}/)
    expect(res.expectedHash).toBe(stale)
    expect(res.actualHash).toMatch(/^[0-9a-f]{16}$/)
    expect(res.actualHash).not.toBe(stale)
    expect(md5OfFile(path)).toBe(afterMutation)
  })

  test("a heading rename makes the old id section_not_found listing the available ids, and a listed id then succeeds", async () => {
    //#given a plan read through the id that is about to stop existing
    const first = await readSection("commit-strategy")
    const { hashline } = first
    const pos = anchorIn(hashline, "Merge commit only.")

    //#when the heading is renamed by a whole-file replace
    writePlan(testDir, "section-plan.md", readPlan(testDir, "section-plan.md").replace("## Commit Strategy", "## Commit Policy"))

    //#then the stale id is refused and the message names the ids the plan now has
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: PLAN_REL, edits: [{ op: "replace", section: "commit-strategy", contentHash: first.section.contentHash, pos, lines: ["hijacked"] }] },
        ctx,
      ),
    )
    expect(res.error).toBe("section_not_found")
    expect(res.message).toContain("commit-strategy")
    expect(res.availableSections).toContain("commit-policy")
    expect(res.availableSections).toContain("todos")

    //#and a retry with a listed id succeeds
    const retry = JSON.parse(
      await updateTool.execute(
        { filePath: PLAN_REL, edits: [{ op: "replace", section: "commit-policy", pos: pos, lines: ["Merge commit only, always."] }] },
        ctx,
      ),
    )
    expect(retry.error).toBeUndefined()
    expect(retry.success).toBe(true)
    expect(readPlan(testDir, "section-plan.md")).toContain("Merge commit only, always.")
  })

  test("an over-cap section append returns size_exceeded and rolls the file back", async () => {
    //#given a plan sitting just under the cap
    const under = buildUnderCapBody(64, "## Execution Strategy")
    writePlan(testDir, "cap-plan.md", `${serializePlanFrontMatter({ status: "pending", revision: 1 })}${under}`)
    const path = planFile(testDir, "cap-plan.md")
    const beforeMd5 = md5OfFile(path)
    const read = JSON.parse(await readTool.execute({ filePath: ".matrixx/plans/cap-plan.md", section: "execution-strategy" }, ctx))
    expect(read.error).toBeUndefined()

    //#when a section-scoped append would push the file over the cap
    const res = JSON.parse(
      await updateTool.execute(
        {
          filePath: ".matrixx/plans/cap-plan.md",
          edits: [{ op: "append", section: "execution-strategy", contentHash: read.section.contentHash, lines: ["x".repeat(MAX_PLAN_FILE_BYTES + 100)] }],
        },
        ctx,
      ),
    )

    //#then the crash-safe rollback fires: hard refusal, byte-unchanged file
    expect(res.error).toBe("size_exceeded")
    expect(res.message).toMatch(/split the plan/i)
    expect(md5OfFile(path)).toBe(beforeMd5)
  })

  test("replace inside a section still requires pos", async () => {
    //#given a section hash but no pos
    const { section } = await readSection("todos")

    //#when a section-scoped replace is submitted without pos
    const res = JSON.parse(
      await updateTool.execute({ filePath: PLAN_REL, edits: [{ op: "replace", section: "todos", contentHash: section.contentHash, lines: ["x"] }] }, ctx),
    )

    //#then it is the same pre-existing validation_error as the whole-file path
    expect(res.error).toBe("validation_error")
    expect(res.message).toContain("pos")
  })

  test("a repeated section without sectionIndex is a fail-closed validation_error", async () => {
    //#given a plan with the corpus's duplicated H3
    const body = ["# D", "", "## TODOs", "", "### Agent-Executed QA Scenarios", "first", "", "### Agent-Executed QA Scenarios", "second", ""].join("\n")
    writePlan(testDir, "dup-plan.md", `${serializePlanFrontMatter({ status: "pending", revision: 1 })}${body}`)

    //#when the duplicated H3 is addressed without an occurrence index
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: ".matrixx/plans/dup-plan.md", edits: [{ op: "append", section: "agent-executed-qa-scenarios", lines: ["x"] }] },
        ctx,
      ),
    )

    //#then it names the valid range instead of silently picking the first
    expect(res.error).toBe("validation_error")
    expect(res.message).toContain("sectionIndex")
    expect(res.message).toContain("0-1")
  })

  test("an unknown section id is section_not_found listing the plan's own ids", async () => {
    //#given a plan that has no such section
    const path = planFile(testDir, "section-plan.md")
    const beforeMd5 = md5OfFile(path)

    //#when an edit names it
    const res = JSON.parse(
      await updateTool.execute({ filePath: PLAN_REL, edits: [{ op: "append", section: "no-such-section", lines: ["x"] }] }, ctx),
    )

    //#then the refusal is fail-closed and self-correcting
    expect(res.error).toBe("section_not_found")
    expect(res.availableSections).toContain("tl-dr")
    expect(res.availableSections).toContain("execution-strategy")
    expect(md5OfFile(path)).toBe(beforeMd5)
  })
})
