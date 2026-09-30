/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PLANS_ARCHIVE_DIR_NAME } from "../../../src/features/mission-state/constants"
import { createPlanListTool } from "../../../src/tools/plan/plan-list"

const TEST_ABORT = new AbortController()

function testContext(testDir: string) {
  return {
    sessionID: "test-session-plan-list-non-kebab",
    messageID: "test-message-plan-list-non-kebab",
    agent: "test-agent",
    abort: TEST_ABORT.signal,
    directory: testDir,
  }
}

interface SkippedEntry {
  name: string
  reason: string
}

interface ListResponse {
  plans: { fileName: string }[]
  skipped?: SkippedEntry[]
  error?: string
}

describe("plan_list non-kebab visibility", () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `plan-list-non-kebab-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(testDir, ".matrixx/plans"), { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("a non-kebab filename is reported in skipped with the rule it violated", async () => {
    //#given a plans dir holding one non-kebab markdown file and one valid plan
    await Bun.write(join(testDir, ".matrixx/plans/My_Bad Plan.md"), "# Oops\n")
    await Bun.write(join(testDir, ".matrixx/plans/good-plan.md"), "# Good\n- [ ] 1. do\n")
    const listTool = createPlanListTool()

    //#when list
    const listed = JSON.parse(await listTool.execute({}, testContext(testDir))) as ListResponse

    //#then the skipped file is named, quoted, and carries the violated rule
    expect(listed.error).toBeUndefined()
    expect(listed.skipped?.length).toBe(1)
    const skipped = listed.skipped?.[0] as SkippedEntry
    expect(skipped.name).toBe("My_Bad Plan.md")
    expect(skipped.reason).toContain("My_Bad Plan.md")
    expect(skipped.reason).toContain("kebab-case")
    expect(listed.plans.map((p) => p.fileName)).toEqual(["good-plan.md"])
  })

  test("a skipped entry carries no progress, size or overCap — it was never processed", async () => {
    //#given a single non-kebab markdown file, so the skip is the only thing reported
    await Bun.write(join(testDir, ".matrixx/plans/UPPER.md"), "# Nope\n")
    const listTool = createPlanListTool()

    //#when list
    const raw = await listTool.execute({}, testContext(testDir))
    const listed = JSON.parse(raw) as ListResponse

    //#then no plan entry was fabricated and the skip is distinguishable from a plan
    expect(listed.plans).toEqual([])
    const skipped = listed.skipped?.[0] as Record<string, unknown>
    expect(Object.keys(skipped).sort()).toEqual(["name", "reason"])
    expect(raw).toContain("skipped")
  })

  test("the skipped reason is derived from PLAN_FILENAME_KEBAB_REGEX, not a second rule", async () => {
    //#given filenames that the single shared regex rejects for different reasons
    await Bun.write(join(testDir, ".matrixx/plans/Dotted.md"), "# a\n")
    await Bun.write(join(testDir, ".matrixx/plans/notmd.txt"), "# b\n")
    const listTool = createPlanListTool()

    //#when list
    const listed = JSON.parse(await listTool.execute({}, testContext(testDir))) as ListResponse

    //#then only the .md file is a skip; a non-.md file is out of scope entirely
    expect(listed.skipped?.map((s) => s.name)).toEqual(["Dotted.md"])
    expect(JSON.stringify(listed)).not.toContain("notmd.txt")
  })

  test("an all-kebab directory returns a byte-identical response with no skipped key", async () => {
    //#given a plans dir with two valid kebab plans only
    await Bun.write(join(testDir, ".matrixx/plans/alpha-plan.md"), "# A\n- [ ] 1. do\n")
    await Bun.write(join(testDir, ".matrixx/plans/beta-plan.md"), "# B\n- [x] 1. done\n")
    const listTool = createPlanListTool()

    //#when list
    const raw = await listTool.execute({}, testContext(testDir))

    //#then the payload is unchanged: no skipped key, only the plans key
    const parsed = JSON.parse(raw) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(["plans"])
    expect("skipped" in parsed).toBe(false)
    expect((parsed.plans as { fileName: string }[]).map((p) => p.fileName).sort()).toEqual([
      "alpha-plan.md",
      "beta-plan.md",
    ])
  })

  test("_archive/ contents stay excluded and are never reported as skips", async () => {
    //#given a live plan, an archived plan in _archive/, and a non-kebab file at the top level
    const plansDir = join(testDir, ".matrixx/plans")
    mkdirSync(join(plansDir, PLANS_ARCHIVE_DIR_NAME), { recursive: true })
    await Bun.write(join(plansDir, "live-plan.md"), "# Live\n- [ ] 1. do\n")
    await Bun.write(join(plansDir, PLANS_ARCHIVE_DIR_NAME, "archived-plan.md"), "# Archived\n")
    await Bun.write(join(plansDir, "Non Kebab.md"), "# Bad\n")
    const listTool = createPlanListTool()

    //#when list
    const listed = JSON.parse(await listTool.execute({}, testContext(testDir))) as ListResponse

    //#then _archive is invisible in both lists; only the top-level offender is a skip
    expect(listed.plans.map((p) => p.fileName)).toEqual(["live-plan.md"])
    expect(listed.skipped?.map((s) => s.name)).toEqual(["Non Kebab.md"])
    expect(JSON.stringify(listed)).not.toContain("archived-plan.md")
  })
})
