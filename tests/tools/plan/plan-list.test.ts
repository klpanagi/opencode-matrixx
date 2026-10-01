/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getPlanProgress } from "../../../src/features/mission-state"
import { createPlanListTool } from "../../../src/tools/plan/plan-list"
import { buildOverCapBody, buildPlanBodyOfBytes, buildUnderCapBody } from "../../fixtures/plan-fixtures"
import { MAX_PLAN_FILE_BYTES, PLANS_ARCHIVE_DIR_NAME } from "../../../src/features/mission-state/constants"

const TEST_ABORT = new AbortController()

function testContext(testDir: string) {
  return {
    sessionID: "test-session-plan-list",
    messageID: "test-message-plan-list",
    agent: "test-agent",
    abort: TEST_ABORT.signal,
    directory: testDir,
  }
}

interface ListedPlan {
  fileName: string
  filePath: string
  mtime: string
  mtimeMs: number
  size: number
  overCap?: boolean
  progress: { total: number; completed: number; isComplete: boolean; needsTriage?: boolean } | { unreadable: true }
}

describe("plan_list progress enrichment", () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `plan-list-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(testDir, ".matrixx/plans"), { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("every listing entry carries a progress field and keeps back-compat fields", async () => {
    //#given a plans dir with one valid kebab plan
    await Bun.write(join(testDir, ".matrixx/plans/alpha-plan.md"), "# A\n- [ ] 1. Do a thing\n")
    const listTool = createPlanListTool()

    //#when list
    const listed = JSON.parse(await listTool.execute({}, testContext(testDir))) as { plans: ListedPlan[] }

    //#then every entry has progress and the legacy fields survive
    expect(listed.plans.length).toBe(1)
    const entry = listed.plans[0]
    expect("progress" in entry).toBe(true)
    expect(entry.progress).not.toBeUndefined()
    expect(typeof entry.fileName).toBe("string")
    expect(typeof entry.filePath).toBe("string")
    expect(typeof entry.mtime).toBe("string")
    expect(typeof entry.mtimeMs).toBe("number")
    expect(typeof entry.size).toBe("number")
  })

  test("progress total/completed match getPlanProgress for enforce-plan-tools-only-access.md", async () => {
    //#given an Oracle-format plan with numbered tasks (numbered wins over meta boxes)
    const filePath = join(testDir, ".matrixx/plans/enforce-plan-tools-only-access.md")
    await Bun.write(
      filePath,
      [
        "# Enforce plan tools only access",
        "",
        "## TODOs",
        "- [x] 1. First task",
        "- [ ] 2. Second task",
        "- [ ] 3. Third task",
        "  - [x] 3.1 nested box must not count",
        "",
      ].join("\n"),
    )
    const listTool = createPlanListTool()

    //#when list
    const listed = JSON.parse(await listTool.execute({}, testContext(testDir))) as { plans: ListedPlan[] }
    const entry = listed.plans.find((p) => p.fileName === "enforce-plan-tools-only-access.md")
    const expected = getPlanProgress(entry?.filePath ?? "")

    //#then the listing progress is the SSOT value
    expect(entry).toBeDefined()
    expect(entry?.progress).toEqual(expected)
    expect((entry?.progress as { total: number }).total).toBe(3)
    expect((entry?.progress as { completed: number }).completed).toBe(1)
  })

  test("oversized plan is flagged unreadable, never throws, and dotted files are excluded", async () => {
    //#given a valid-kebab plan past the cap, a normal plan, and a dotted file
    await Bun.write(join(testDir, ".matrixx/plans/oversized-plan.md"), buildOverCapBody(1))
    await Bun.write(join(testDir, ".matrixx/plans/normal-plan.md"), "# N\n- [x] 1. done\n")
    await Bun.write(join(testDir, ".matrixx/plans/dotted.plan.md"), "# hidden\n")
    const listTool = createPlanListTool()

    //#when list
    const listed = JSON.parse(await listTool.execute({}, testContext(testDir))) as { plans: ListedPlan[]; error?: string }

    //#then listing survives, oversized entry is flagged, dotted excluded
    expect(listed.error).toBeUndefined()
    const names = listed.plans.map((p) => p.fileName)
    expect(names).toContain("oversized-plan.md")
    expect(names).toContain("normal-plan.md")
    expect(names).not.toContain("dotted.plan.md")

    const big = listed.plans.find((p) => p.fileName === "oversized-plan.md")
    expect(big?.size).toBeGreaterThan(MAX_PLAN_FILE_BYTES)
    expect(big?.progress).toEqual({ unreadable: true })

    const normal = listed.plans.find((p) => p.fileName === "normal-plan.md")
    expect((normal?.progress as { total: number }).total).toBe(1)
  })

  test("just-under and just-over the cap are both listed, distinguishable only by size and overCap", async () => {
    //#given one plan exactly at the cap and one a single byte over it
    await Bun.write(join(testDir, ".matrixx/plans/just-under-cap.md"), buildUnderCapBody(0, "# Under\n"))
    await Bun.write(join(testDir, ".matrixx/plans/just-over-cap.md"), buildOverCapBody(1, "# Over\n"))
    const listTool = createPlanListTool()

    //#when list
    const listed = JSON.parse(await listTool.execute({}, testContext(testDir))) as {
      plans: ListedPlan[]
      error?: string
    }

    //#then neither is skipped or refused, and only the over-cap one is flagged
    expect(listed.error).toBeUndefined()
    const names = listed.plans.map((p) => p.fileName)
    expect(names).toContain("just-under-cap.md")
    expect(names).toContain("just-over-cap.md")

    const under = listed.plans.find((p) => p.fileName === "just-under-cap.md")
    const over = listed.plans.find((p) => p.fileName === "just-over-cap.md")
    expect(under?.size).toBe(MAX_PLAN_FILE_BYTES)
    expect(over?.size).toBe(MAX_PLAN_FILE_BYTES + 1)
    expect(under?.overCap).toBe(false)
    expect(over?.overCap).toBe(true)

    // the boundary shows up in progress too: under-cap is counted, over-cap degrades
    expect(under?.progress).not.toEqual({ unreadable: true })
    expect(over?.progress).toEqual({ unreadable: true })
  })

  test("a 150,000-byte plan is listed with its real size so it can be found and repaired", async () => {
    //#given a plan well past the cap, sized the way a real runaway plan would be
    const body = buildPlanBodyOfBytes(150_000, "# Runaway\n")
    await Bun.write(join(testDir, ".matrixx/plans/runaway-plan.md"), body)
    const listTool = createPlanListTool()

    //#when list
    const listed = JSON.parse(await listTool.execute({}, testContext(testDir))) as {
      plans: ListedPlan[]
      error?: string
    }

    //#then it appears with its true size, flagged over cap, and never refused
    expect(listed.error).toBeUndefined()
    const entry = listed.plans.find((p) => p.fileName === "runaway-plan.md")
    expect(entry).toBeDefined()
    expect(entry?.size).toBe(Buffer.byteLength(body, "utf8"))
    expect(entry?.overCap).toBe(true)
  })

  test("archived plans under _archive/ never appear in the listing", async () => {
    //#given a live plan plus an archived plan in the _archive subdirectory
    const plansDir = join(testDir, ".matrixx/plans")
    mkdirSync(join(plansDir, PLANS_ARCHIVE_DIR_NAME), { recursive: true })
    await Bun.write(join(plansDir, "live-plan.md"), "# Live\n- [ ] 1. do\n")
    await Bun.write(join(plansDir, PLANS_ARCHIVE_DIR_NAME, "archived-plan.md"), "# Archived\n")
    const listTool = createPlanListTool()

    //#when list
    const listed = JSON.parse(await listTool.execute({}, testContext(testDir))) as {
      plans: ListedPlan[]
      error?: string
    }

    //#then only the live plan is listed
    expect(listed.error).toBeUndefined()
    const names = listed.plans.map((p) => p.fileName)
    expect(names).toEqual(["live-plan.md"])
    expect(names).not.toContain("archived-plan.md")
  })

  test("plan without checkboxes reports needsTriage", async () => {
    //#given a plan with no task checkboxes
    await Bun.write(join(testDir, ".matrixx/plans/empty-plan.md"), "# Empty\n\nNo tasks here yet.\n")
    const listTool = createPlanListTool()

    //#when list
    const listed = JSON.parse(await listTool.execute({}, testContext(testDir))) as { plans: ListedPlan[] }
    const entry = listed.plans.find((p) => p.fileName === "empty-plan.md")

    //#then total is zero and needsTriage is set
    expect((entry?.progress as { total: number }).total).toBe(0)
    expect((entry?.progress as { needsTriage?: boolean }).needsTriage).toBe(true)
    expect((entry?.progress as { isComplete: boolean }).isComplete).toBe(true)
  })
})
