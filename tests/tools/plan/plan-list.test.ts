/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getPlanProgress } from "../../../src/features/mission-state"
import { createPlanListTool } from "../../../src/tools/plan/plan-list"

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
    //#given a valid-kebab plan past the 102400-byte cap, a normal plan, and a dotted file
    await Bun.write(join(testDir, ".matrixx/plans/oversized-plan.md"), "a".repeat(102_401))
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
    expect(big?.size).toBeGreaterThan(102_400)
    expect(big?.progress).toEqual({ unreadable: true })

    const normal = listed.plans.find((p) => p.fileName === "normal-plan.md")
    expect((normal?.progress as { total: number }).total).toBe(1)
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
