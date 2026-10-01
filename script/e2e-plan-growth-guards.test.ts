/**
 * E2E — plan growth guards (cap raise + trim enforcement)
 *
 * The reported failure: Oracle could not create or update a plan because the
 * plan-size limits refused the writes. PR #154 raised the cap from 102400 to
 * 140000, added the trim_required escalation, slimmed the contract, and gave
 * the Oracle a pre-write byte estimate. This suite drives the REAL tool
 * factories (`plan_create` / `plan_update` / `plan_tasks` / `plan_read`) over a
 * realistic Oracle-shaped plan, so the guard is exercised through the same
 * entry points production uses — not through `enforcePlanCap` in isolation.
 *
 * Located in `script/` deliberately: CI discovers tests with
 * `find tests script -name '*.test.ts'`, so a `scripts/` (plural) directory
 * would never run.
 *
 * Run in isolation:
 *   bun test script/e2e-plan-growth-guards.test.ts
 */
/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MAX_PLAN_FILE_BYTES, measurePlanBytes, resolvePlanCap } from "../src/features/mission-state/constants"
import { renderPlanSkeleton } from "../src/features/plan-contract/skeleton"
import { PlansConfigSchema } from "../src/config/schema/plans"
import { createPlanCreateTool } from "../src/tools/plan/plan-create"
import { createPlanReadTool } from "../src/tools/plan/plan-read"
import { createPlanTasksTool } from "../src/tools/plan/plan-tasks"
import { createPlanUpdateTool } from "../src/tools/plan/plan-update"
import {
  TRIM_REQUIRED_AFTER_CONSECUTIVE_REFUSALS,
  resetPlanWriteGuardForTesting,
} from "../src/tools/plan/plan-write-guard"

/**
 * The cap BEFORE PR #154. Hard-coded on purpose: the entire point of the
 * regression fence is that a plan living in the 102400..140000 band was
 * unwritable before and must be writable now. If this literal ever equals
 * MAX_PLAN_FILE_BYTES the band is empty and the suite proves nothing.
 */
const PRE_154_CAP = 102_400

const PLAN_NAME = "growth-guard-plan.md"
const PLAN_REL = `.matrixx/plans/${PLAN_NAME}`

const TEST_ABORT = new AbortController()

function testContext(dir: string): ToolContext {
  return {
    sessionID: "ses-e2e-plan-growth",
    messageID: "msg-e2e-plan-growth",
    agent: "oracle",
    abort: TEST_ABORT.signal,
    directory: dir,
    worktree: dir,
    metadata: () => {},
    ask: async () => {},
  } as unknown as ToolContext
}

/**
 * One Oracle-shaped task block: the five REQUIRED_TASK_SUBFIELDS (the two
 * OPTIONAL_TASK_SUBFIELDS are deliberately absent — see the contract-slimming
 * case below) plus a QA scenario. Sized like real Oracle output, not a stub.
 */
function taskBlock(n: number): string {
  return [
    `- [ ] ${n}. Task ${n}: implement widget ${n}`,
    "",
    "  **What to do**:",
    `  - Implement \`src/widgets/widget-${n}.ts\` exporting \`createWidget${n}\`.`,
    "  - Wire it into the registry map and re-export from the barrel.",
    "  - Add a focused unit test for the happy path and one negative case.",
    "",
    "  **Recommended Agent Profile**: mouse (source) — single-module logic.",
    "",
    "  **References**:",
    "  - `src/widgets/widget-1.ts` — sibling implementation to mirror.",
    "  - `src/index.ts` — registry map to extend.",
    "",
    "  **Acceptance Criteria**:",
    `  - \`bun test tests/widgets/widget-${n}.test.ts\` passes.`,
    "  - `bun run typecheck` exits 0.",
    "  - No new `as any` introduced.",
    "",
    "  **Agent-Executed QA Scenarios (MANDATORY — ALL tasks)**:",
    "    Scenario: widget creates with defaults",
    "      Tool: bash",
    "      Preconditions: dependencies installed",
    "      Steps:",
    `        1. bun test tests/widgets/widget-${n}.test.ts`,
    "        2. Assert: 0 fail",
    "      Expected Result: green",
    `      Evidence: .matrixx/evidence/task-${n}-defaults.log`,
    "",
  ].join("\n")
}

/**
 * A full canonical plan: the real `renderPlanSkeleton()` with its sample task
 * replaced by `taskCount` generated tasks. Rendering from the skeleton means
 * the fixture cannot drift from the contract the tools actually enforce.
 */
function buildOraclePlan(taskCount: number): string {
  const skeleton = renderPlanSkeleton()
  const head = skeleton.slice(0, skeleton.indexOf("## TODOs"))
  const tail = skeleton.slice(skeleton.indexOf("## Commit Strategy"))
  const todos = Array.from({ length: taskCount }, (_, i) => taskBlock(i + 1)).join("\n")
  return `${head}## TODOs\n\n${todos}\n${tail}`
}

/**
 * A plan parked just under the cap, padded with SHORT lines.
 *
 * The padding is deliberately many short lines rather than one long one: a
 * single 130KB line makes any paginated `plan_read` window exceed the render
 * budget, so the anchors a trim needs could never be resolved.
 */
function buildPaddedNearCapPlan(): string {
  const seed = buildOraclePlan(8)
  const remaining = MAX_PLAN_FILE_BYTES - measurePlanBytes(seed) - 400
  const line = `<!-- pad ${"p".repeat(50)} -->`
  const padding = Array.from({ length: Math.ceil(remaining / measurePlanBytes(`${line}\n`)) }, () => line).join("\n")
  return `${seed}\n${padding}`
}

/** Task count whose plan lands inside the 102400..140000 band PR #154 opened. */
function taskCountForPreCapBand(): number {
  let n = 8
  while (measurePlanBytes(buildOraclePlan(n)) <= PRE_154_CAP) n += 4
  return n
}

/**
 * The first `LINE#ID` anchor whose row contains `needle`.
 *
 * A whole-file `plan_read` of a large plan returns `{truncated, outline, hint}`
 * rather than a body — the render budget, not the cap — so anchors must come
 * from a PAGINATED read. Windows are walked until the needle appears.
 */
async function anchorFor(ctx: ToolContext, needle: string, window = 200): Promise<string> {
  const readTool = createPlanReadTool()
  for (let offset = 1; ; offset += window) {
    const res = JSON.parse(await readTool.execute({ filePath: PLAN_REL, offset, limit: window }, ctx))
    if (res.error !== undefined || typeof res.hashline !== "string") {
      throw new Error(`plan_read failed at offset ${offset}: ${res.error ?? "no hashline payload"}`)
    }
    const rows = res.hashline.split("\n")
    const row = rows.find((line: string) => line.includes(needle))
    if (row !== undefined) return row.split("|")[0] as string
    if (rows.length < window) throw new Error(`no hashline row contains: ${needle}`)
  }
}

/** The text of the hashline row at `anchor`, with its anchor prefix removed. */
async function rowTextFor(ctx: ToolContext, needle: string): Promise<string> {
  const readTool = createPlanReadTool()
  for (let offset = 1; ; offset += 200) {
    const res = JSON.parse(await readTool.execute({ filePath: PLAN_REL, offset, limit: 200 }, ctx))
    const row = res.hashline?.split("\n").find((line: string) => line.includes(needle))
    if (row !== undefined) return row.slice(row.indexOf("|") + 1)
  }
}

describe("E2E: plan growth guards — Oracle can create and update a plan", () => {
  let dir: string
  let ctx: ToolContext

  beforeEach(() => {
    dir = join(tmpdir(), `e2e-plan-growth-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(dir, ".matrixx/plans"), { recursive: true })
    ctx = testContext(dir)
    resetPlanWriteGuardForTesting()
  })

  afterEach(() => {
    resetPlanWriteGuardForTesting()
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  })

  test("the fixture really sits in the band the cap raise opened", () => {
    //#given a plan sized to the pre-raise cap
    const content = buildOraclePlan(taskCountForPreCapBand())

    //#when it is measured with the single byte ruler
    const bytes = measurePlanBytes(content)

    //#then it is over the OLD cap and under the NEW one — otherwise the
    //     regression cases below would pass trivially
    expect(bytes).toBeGreaterThan(PRE_154_CAP)
    expect(bytes).toBeLessThan(MAX_PLAN_FILE_BYTES)
  })

  test("plan_create persists a plan the old cap would have refused", async () => {
    //#given a plan in the 102400..140000 band
    const content = buildOraclePlan(taskCountForPreCapBand())
    const createTool = createPlanCreateTool()

    //#when Oracle creates it through the real tool
    const res = JSON.parse(await createTool.execute({ filePath: PLAN_REL, content }, ctx))

    //#then it succeeds and the stored bytes are readable under the new cap
    expect(res.error).toBeUndefined()
    expect(res.success).toBe(true)
    const stored = readFileSync(join(dir, ".matrixx/plans", PLAN_NAME), "utf-8")
    expect(statSync(join(dir, ".matrixx/plans", PLAN_NAME)).size).toBeLessThanOrEqual(MAX_PLAN_FILE_BYTES)
    expect(stored.startsWith("# ")).toBe(true)
  })

  test("the same plan is refused at the old cap, proving the guard is real", async () => {
    //#given the same content and a tool wired to the PRE-154 cap
    const content = buildOraclePlan(taskCountForPreCapBand())
    const createTool = createPlanCreateTool(undefined, PRE_154_CAP)

    //#when Oracle creates it
    const res = JSON.parse(await createTool.execute({ filePath: PLAN_REL, content }, ctx))

    //#then it is refused and nothing is persisted — the bug that was reported
    expect(res.error).toBe("size_exceeded")
    expect(existsSync(join(dir, ".matrixx/plans", PLAN_NAME))).toBe(false)
  })

  test("plan_tasks returns a full manifest for the large plan", async () => {
    //#given a persisted large plan
    const content = buildOraclePlan(taskCountForPreCapBand())
    await createPlanCreateTool().execute({ filePath: PLAN_REL, content }, ctx)
    const expectedTasks = taskCountForPreCapBand()

    //#when Oracle asks for the manifest instead of the body
    const res = JSON.parse(await createPlanTasksTool().execute({ filePath: PLAN_REL }, ctx))

    //#then every task is listed and the progress total matches
    expect(res.error).toBeUndefined()
    expect(res.degraded).toBeUndefined()
    expect(res.progress.total).toBe(expectedTasks)
    expect(res.progress.remaining).toBe(expectedTasks)
    expect(res.progress.isComplete).toBe(false)
    expect(res.tasks.length).toBe(expectedTasks)
  })

  test("plan_update can still edit the large plan (progress check-off round-trip)", async () => {
    //#given a persisted large plan with one task marked done
    const content = buildOraclePlan(taskCountForPreCapBand())
    await createPlanCreateTool().execute({ filePath: PLAN_REL, content }, ctx)
    const updateTool = createPlanUpdateTool()

    //#when Oracle flips the first task to complete via a hashline anchor
    const anchor = await anchorFor(ctx, "1. Task 1: implement widget 1")
    const source = await rowTextFor(ctx, "1. Task 1: implement widget 1")
    expect(source.startsWith("- [ ] ")).toBe(true)
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: PLAN_REL, edits: [{ op: "replace", pos: anchor, lines: [source.replace("- [ ]", "- [x]")] }] },
        ctx,
      ),
    )

    //#then the edit persists and the manifest reflects it
    expect(res.error).toBeUndefined()
    expect(res.success).toBe(true)
    const after = JSON.parse(await createPlanTasksTool().execute({ filePath: PLAN_REL }, ctx))
    expect(after.progress.completed).toBe(1)
    expect(after.progress.total).toBe(taskCountForPreCapBand())
  })

  test("the cap is configurable and a LOWERED cap is enforced by the real tools", async () => {
    //#given a config that lowers the cap below the plan
    const content = buildOraclePlan(40)
    const cfg = PlansConfigSchema.parse({ max_plan_file_bytes: 32 * 1024 })
    const cap = resolvePlanCap({ plans: cfg })
    expect(cap).toBe(32 * 1024)

    //#when Oracle creates the plan with the configured cap
    const res = JSON.parse(await createPlanCreateTool(undefined, cap).execute({ filePath: PLAN_REL, content }, ctx))

    //#then the write is refused — the knob is wired to enforcement, not just stored
    expect(res.error).toBe("size_exceeded")
    expect(existsSync(join(dir, ".matrixx/plans", PLAN_NAME))).toBe(false)
  })

  test("contract slimming: the two OPTIONAL_TASK_SUBFIELDS produce no warnings", async () => {
    //#given a plan whose tasks omit "Must NOT do" and "Parallelization"
    const content = buildOraclePlan(taskCountForPreCapBand())
    expect(content).not.toContain("**Must NOT do**")
    expect(content).not.toContain("**Parallelization**")

    //#when Oracle creates it
    const res = JSON.parse(await createPlanCreateTool().execute({ filePath: PLAN_REL, content }, ctx))

    //#then no missing_subfield warning is raised — those labels are optional now
    expect(res.success).toBe(true)
    expect(res.warnings).toEqual([])
  })

  test("repeated growing writes escalate to trim_required and never touch the file", async () => {
    //#given a plan parked just under the cap
    const content = buildPaddedNearCapPlan()
    await createPlanCreateTool().execute({ filePath: PLAN_REL, content }, ctx)
    const path = join(dir, ".matrixx/plans", PLAN_NAME)
    const before = readFileSync(path, "utf-8")
    const updateTool = createPlanUpdateTool()

    //#when Oracle keeps appending past the cap
    const codes: string[] = []
    let lastPayload: Record<string, unknown> = {}
    for (let i = 0; i < TRIM_REQUIRED_AFTER_CONSECUTIVE_REFUSALS + 1; i++) {
      const res = JSON.parse(
        await updateTool.execute(
          { filePath: PLAN_REL, edits: [{ op: "append", lines: [`\n${"q".repeat(300)}`] }] },
          ctx,
        ),
      )
      expect(res.error).toBeDefined()
      codes.push(res.error as string)
      lastPayload = res
      //#then every refused attempt leaves the file byte-identical
      expect(readFileSync(path, "utf-8")).toBe(before)
    }

    //#then the first refusals are size_exceeded and the last escalates to trim_required
    expect(codes.slice(0, TRIM_REQUIRED_AFTER_CONSECUTIVE_REFUSALS)).toEqual(
      Array.from({ length: TRIM_REQUIRED_AFTER_CONSECUTIVE_REFUSALS }, () => "size_exceeded"),
    )
    expect(codes[codes.length - 1]).toBe("trim_required")

    //#and the escalation carries actionable diagnostics, not a bare byte total
    expect(lastPayload.actual).toBeGreaterThan(MAX_PLAN_FILE_BYTES as number)
    expect(lastPayload.cap).toBe(MAX_PLAN_FILE_BYTES)
    expect(typeof lastPayload.overBy).toBe("number")
    expect(String(lastPayload.hint).toLowerCase()).toContain("trim")
  })

  test("a shrinking write recovers from trim_required — Oracle is never wedged", async () => {
    //#given a plan driven past the escalation threshold
    const content = buildPaddedNearCapPlan()
    await createPlanCreateTool().execute({ filePath: PLAN_REL, content }, ctx)
    const path = join(dir, ".matrixx/plans", PLAN_NAME)
    const updateTool = createPlanUpdateTool()
    const grow = async () =>
      JSON.parse(
        await updateTool.execute(
          { filePath: PLAN_REL, edits: [{ op: "append", lines: [`\n${"q".repeat(300)}`] }] },
          ctx,
        ),
      )
    for (let i = 0; i < TRIM_REQUIRED_AFTER_CONSECUTIVE_REFUSALS + 1; i++) await grow()

    //#when Oracle instead DELETES a filler block, shrinking the file well past
    //     the front-matter bytes the first update injects
    const before2 = readFileSync(path, "utf-8")
    const anchor = await anchorFor(ctx, "<!-- pad pppp")
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: PLAN_REL, edits: [{ op: "replace", pos: anchor, end: anchor, lines: [] }] },
        ctx,
      ),
    )
    expect(res.success).toBe(true)
    expect(readFileSync(path, "utf-8").length).toBeLessThan(before2.length)

    //#then the shrinking write is accepted and the plan is editable again
    expect(res.error).toBeUndefined()
    expect(res.success).toBe(true)
    expect(statSync(path).size).toBeLessThan(MAX_PLAN_FILE_BYTES)

    //#and the guard's counter reset, so the next growing write starts at size_exceeded
    const next = await grow()
    expect(next.error).toBe("size_exceeded")
  })

  test("the cap is a ceiling, not a wall: an over-cap plan stays fully workable", async () => {
    //#given a plan forced OVER the cap (written directly, as a foreign writer would)
    const content = `${buildOraclePlan(taskCountForPreCapBand())}\n${"z".repeat(MAX_PLAN_FILE_BYTES)}`
    const path = join(dir, ".matrixx/plans", PLAN_NAME)
    writeFileSync(path, content, "utf-8")
    expect(statSync(path).size).toBeGreaterThan(MAX_PLAN_FILE_BYTES)
    const readTool = createPlanReadTool()

    //#when Oracle reads it three ways
    const whole = JSON.parse(await readTool.execute({ filePath: PLAN_REL }, ctx))
    const windowed = JSON.parse(await readTool.execute({ filePath: PLAN_REL, format: "content", offset: 1, limit: 20 }, ctx))
    const sectioned = JSON.parse(await readTool.execute({ filePath: PLAN_REL, format: "content", section: "tl-dr" }, ctx))
    const manifest = JSON.parse(await createPlanTasksTool().execute({ filePath: PLAN_REL }, ctx))

    //#then only the unbounded whole-file read is refused; the other three work
    expect(whole.error).toBe("file_too_large")
    expect(windowed.error).toBeUndefined()
    expect(sectioned.error).toBeUndefined()
    expect(sectioned.section.id).toBe("tl-dr")
    expect(manifest.error).toBeUndefined()
    expect(manifest.degraded.reason).toBe("file_over_cap")
    expect(manifest.progress.total).toBe(taskCountForPreCapBand())
  })

  test("the byte ruler is UTF-8, so CJK content is not silently undercounted", async () => {
    //#given CJK content whose UTF-16 length is under the cap but whose UTF-8 size is not
    const cjk = "漢".repeat(60_000)
    expect(cjk.length).toBeLessThan(PRE_154_CAP)
    expect(measurePlanBytes(cjk)).toBeGreaterThan(MAX_PLAN_FILE_BYTES)
    const content = `# 計画\n\n## TODOs\n\n${"- [ ] 1. 実装する"}\n\n${cjk}`

    //#when Oracle creates it
    const res = JSON.parse(await createPlanCreateTool().execute({ filePath: PLAN_REL, content }, ctx))

    //#then it is refused — a `.length` ruler would have let 180KB through
    expect(res.error).toBe("size_exceeded")
    expect(existsSync(join(dir, ".matrixx/plans", PLAN_NAME))).toBe(false)
  })
})
