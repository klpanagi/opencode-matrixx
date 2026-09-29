/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { measurePlanBytes } from "../../../src/features/mission-state/constants"
import { MAX_PLAN_FILE_BYTES, MAX_PLAN_READ_RENDERED_BYTES } from "../../../src/tools/plan/constants"
import { createPlanTasksTool } from "../../../src/tools/plan/plan-tasks"
import { buildPlanBodyOfBytes } from "../../fixtures/plan-fixtures"

const TEST_ABORT = new AbortController()

function testContext(testDir: string) {
  return {
    sessionID: "test-session-plan-tasks-degrade",
    messageID: "test-message-plan-tasks-degrade",
    agent: "test-agent",
    abort: TEST_ABORT.signal,
    directory: testDir,
  }
}

function makePlanDir(name: string): string {
  const dir = join(tmpdir(), name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, ".matrixx/plans"), { recursive: true })
  return dir
}

function writePlan(dir: string, name: string, content: string): void {
  mkdirSync(join(dir, ".matrixx/plans"), { recursive: true })
  Bun.write(join(dir, ".matrixx/plans", name), content)
}

/**
 * A plan of exactly `bytes` UTF-8 bytes, carrying `taskCount` real numbered
 * tasks and a Definition of Done, so the manifest is genuinely useful after the
 * degrade. The remainder is single-line filler.
 */
function buildOverCapTaskPlan(bytes: number, taskCount: number): string {
  const lines = ["# Over Cap Plan", "", "## TODOs", ""]
  for (let i = 1; i <= taskCount; i++) {
    lines.push(`- [${i % 3 === 0 ? "x" : " "}] ${i}. Task number ${i} with a realistic length title`)
  }
  lines.push("", "## Definition of Done", "", "- [ ] All tasks complete", "- [x] Verified", "")
  const body = lines.join("\n")
  const filler = bytes - Buffer.byteLength(body, "utf8")
  if (filler < 0) throw new Error(`body is ${-filler} bytes over the requested size`)
  return body + "a".repeat(filler)
}

interface ManifestResult {
  filePath: string
  progress?: {
    total: number
    completed: number
    remaining: number
    isComplete: boolean
    needsTriage?: boolean
  }
  tasks?: Array<{ n: number; title: string; checked: boolean; line: number; anchor: string }>
  dod?: string[]
  degraded?: { reason: string; size: number; cap: number; message: string }
  tasksTruncated?: { shown: number; total: number }
  hint?: string
  error?: string
  message?: string
}

describe("plan_tasks degrades over the cap instead of refusing (Task 16)", () => {
  let testDir: string
  let tool: ReturnType<typeof createPlanTasksTool>

  beforeEach(() => {
    testDir = makePlanDir(`plan-tasks-degrade-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    tool = createPlanTasksTool()
  })

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
  })

  test("a 120,000-byte plan returns a usable manifest with a degradation marker and no error", async () => {
    //#given a plan well over the hard cap but with parseable tasks
    const content = buildOverCapTaskPlan(120_000, 200)
    writePlan(testDir, "over-cap-plan.md", content)
    expect(Buffer.byteLength(content, "utf8")).toBe(120_000)
    expect(Buffer.byteLength(content, "utf8")).toBeGreaterThan(MAX_PLAN_FILE_BYTES)

    //#when the manifest is requested
    const raw = await tool.execute({ filePath: ".matrixx/plans/over-cap-plan.md" }, testContext(testDir))
    const res = JSON.parse(raw) as ManifestResult

    //#then it degrades: a full manifest, explicitly marked, never an error
    expect(res.error).toBeUndefined()
    expect(res.degraded).toBeDefined()
    expect(res.degraded?.reason).toBe("file_over_cap")
    expect(res.degraded?.size).toBe(120_000)
    expect(res.degraded?.cap).toBe(MAX_PLAN_FILE_BYTES)
    //#then the manifest itself is intact and derived from the authoritative parsers
    expect(res.filePath.endsWith("over-cap-plan.md")).toBe(true)
    expect(res.progress?.total).toBe(200)
    expect(res.tasks?.length).toBe(200)
    expect(res.tasks?.[0]?.anchor).toMatch(/^\d+#[A-Z0-9]+$/)
    expect(res.dod).toEqual(["All tasks complete", "Verified"])
  })

  test("a pathological over-cap plan is clamped to the rendered budget, truncating tasks from the tail", async () => {
    //#given a plan whose manifest would far exceed the rendered budget
    const content = buildOverCapTaskPlan(200_000, 600)
    writePlan(testDir, "pathological-plan.md", content)

    //#when the manifest is requested
    const raw = await tool.execute({ filePath: ".matrixx/plans/pathological-plan.md" }, testContext(testDir))
    const res = JSON.parse(raw) as ManifestResult

    //#then it fits the budget, measured with the single byte ruler
    expect(measurePlanBytes(raw)).toBeLessThanOrEqual(MAX_PLAN_READ_RENDERED_BYTES)
    //#then the truncation is explicit and the tail is what got dropped
    expect(res.error).toBeUndefined()
    expect(res.degraded).toBeDefined()
    expect(res.tasksTruncated?.total).toBe(600)
    expect(res.tasksTruncated?.shown).toBe((res.tasks?.length ?? 0) as number)
    expect((res.tasks?.length ?? 0)).toBeLessThan(600)
    //#then the surviving tasks are the HEAD of the list, in order
    expect(res.tasks?.[0]?.n).toBe(1)
    //#then the hint names a concrete next call with a section selector
    expect(res.hint).toContain("plan_read")
    expect(res.hint).toContain("section")
    //#then progress and dod survive the truncation
    expect(res.progress?.total).toBe(600)
    expect(res.dod).toEqual(["All tasks complete", "Verified"])
  })

  test("a small over-cap plan is degraded but NOT truncated", async () => {
    //#given an over-cap plan with few enough tasks to fit the rendered budget
    const content = buildPlanBodyOfBytes(MAX_PLAN_FILE_BYTES + 20, "## TODOs")
    writePlan(testDir, "wide-plan.md", content)

    //#when the manifest is requested
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/wide-plan.md" }, testContext(testDir)),
    ) as ManifestResult

    //#then only the degradation marker is present — no spurious truncation
    expect(res.degraded).toBeDefined()
    expect(res.tasksTruncated).toBeUndefined()
    expect(res.hint).toBeUndefined()
    expect(res.progress?.total).toBe(0)
  })

  test("an over-cap but unreadable file is read_failed, never a degraded manifest (errno wins)", async () => {
    //#given an over-cap file with permissions removed
    const target = join(testDir, ".matrixx/plans", "locked-over-cap.md")
    writePlan(testDir, "locked-over-cap.md", buildOverCapTaskPlan(120_000, 200))
    chmodSync(target, 0o000)

    //#when the manifest is requested
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/locked-over-cap.md" }, testContext(testDir)),
    ) as ManifestResult

    //#then the read failure is reported as itself
    chmodSync(target, 0o600)
    expect(res.error).toBe("read_failed")
    expect(res.degraded).toBeUndefined()
    expect(res.tasks).toBeUndefined()
  })

  test("an under-cap but unreadable file is read_failed, never a degraded manifest", async () => {
    //#given an under-cap file with permissions removed
    writePlan(testDir, "locked-plan.md", "# Small\n\n- [ ] 1. One\n")
    const target = join(testDir, ".matrixx/plans", "locked-plan.md")
    chmodSync(target, 0o000)

    //#when the manifest is requested
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/locked-plan.md" }, testContext(testDir)),
    ) as ManifestResult

    //#then the read failure is reported as itself
    chmodSync(target, 0o600)
    expect(res.error).toBe("read_failed")
    expect(res.degraded).toBeUndefined()
  })
})

describe("plan_tasks under-cap output is byte-identical to the pre-degrade behaviour", () => {
  const IDENTITY_DIR_NAME = "plan-tasks-under-cap-identity"

  /**
   * Byte-for-byte the output this tool produced before Task 16 existed.
   *
   * The manifest embeds the ABSOLUTE resolved path, which is rooted at
   * `tmpdir()` and therefore at `$TMPDIR` — which differs between a developer
   * shell and a sandboxed/CI runner. The path is substituted rather than
   * hardcoded so the assertion tests the thing that actually matters (no new
   * keys, no reordering, no value drift) instead of the ambient TMPDIR.
   */
  const preChangeManifest = (dir: string): string =>
    `{"filePath":"${dir}/.matrixx/plans/sample-plan.md","progress":{"total":13,"completed":4,"remaining":9,"isComplete":false},"tasks":[{"n":1,"title":"Task number 1","checked":false,"line":5,"anchor":"5#JM"},{"n":2,"title":"Task number 2","checked":false,"line":6,"anchor":"6#VV"},{"n":3,"title":"Task number 3","checked":true,"line":7,"anchor":"7#ZW"},{"n":4,"title":"Task number 4","checked":false,"line":8,"anchor":"8#PW"},{"n":5,"title":"Task number 5","checked":false,"line":9,"anchor":"9#TQ"},{"n":6,"title":"Task number 6","checked":true,"line":10,"anchor":"10#NZ"},{"n":7,"title":"Task number 7","checked":false,"line":11,"anchor":"11#MM"},{"n":8,"title":"Task number 8","checked":false,"line":12,"anchor":"12#MJ"},{"n":9,"title":"Task number 9","checked":true,"line":13,"anchor":"13#YQ"},{"n":10,"title":"Task number 10","checked":false,"line":14,"anchor":"14#NV"},{"n":11,"title":"Task number 11","checked":false,"line":15,"anchor":"15#XT"},{"n":12,"title":"Task number 12","checked":true,"line":16,"anchor":"16#BB"},{"n":13,"title":"Task number 13","checked":false,"line":17,"anchor":"17#ZS"}],"dod":["All tasks complete","Verified"]}`

  function buildThirteenTaskPlan(): string {
    const lines = ["# Thirteen Task Plan", "", "## TODOs", ""]
    for (let i = 1; i <= 13; i++) {
      lines.push(`- [${i % 3 === 0 ? "x" : " "}] ${i}. Task number ${i}`)
    }
    lines.push("", "## Definition of Done", "", "- [ ] All tasks complete", "- [x] Verified", "")
    return lines.join("\n")
  }

  test("the serialized manifest is byte-for-byte unchanged, with no new keys", async () => {
    //#given a deterministic project dir and an under-cap plan
    const dir = makePlanDir(IDENTITY_DIR_NAME)
    writePlan(dir, "sample-plan.md", buildThirteenTaskPlan())
    const tool = createPlanTasksTool()

    //#when the manifest is requested
    const raw = await tool.execute({ filePath: ".matrixx/plans/sample-plan.md" }, testContext(dir))

    //#then the bytes are exactly what the pre-degrade implementation produced
    expect(raw).toBe(preChangeManifest(dir))
    //#then the golden is still load-bearing: no degradation key leaked into the
    //#under-cap envelope. Guards the comparison from being silently weakened.
    expect(JSON.parse(raw)).not.toHaveProperty("degraded")
    rmSync(dir, { recursive: true, force: true })
  })
})
