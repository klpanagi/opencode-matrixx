/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parsePlanFrontMatter } from "../../../src/features/plan-contract"
import { MAX_PLAN_FILE_BYTES } from "../../../src/tools/plan/constants"
import { createPlanCreateTool } from "../../../src/tools/plan/plan-create"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"
import { createPlanUpdateTool } from "../../../src/tools/plan/plan-update"

const TEST_ABORT = new AbortController()

function testContext(testDir: string): ToolContext {
  return {
    sessionID: "test-session-plan-update",
    messageID: "test-message-plan-update",
    agent: "test-agent",
    abort: TEST_ABORT.signal,
    directory: testDir,
  } as unknown as ToolContext
}

function planPath(dir: string, fileName: string): string {
  return join(dir, ".matrixx/plans", fileName)
}

/** Count leading `---` fences; a single front-matter block renders exactly two. */
function frontMatterFences(content: string): number {
  return (content.match(/^---$/gm) ?? []).length
}

describe("plan_update contract validation + write guards", () => {
  let testDir: string
  let ctx: ToolContext
  let createTool: ReturnType<typeof createPlanCreateTool>
  let readTool: ReturnType<typeof createPlanReadTool>
  let updateTool: ReturnType<typeof createPlanUpdateTool>

  beforeEach(() => {
    testDir = join(tmpdir(), `plan-update-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(testDir, ".matrixx/plans"), { recursive: true })
    ctx = testContext(testDir)
    createTool = createPlanCreateTool()
    readTool = createPlanReadTool()
    updateTool = createPlanUpdateTool()
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  /** Resolve the LINE#ID anchor for the first hashline row containing `needle`. */
  async function anchorFor(fileName: string, needle: string): Promise<string> {
    const read = JSON.parse(await readTool.execute({ filePath: `.matrixx/plans/${fileName}` }, ctx))
    const row = (read.hashline as string).split("\n").find((line) => line.includes(needle))
    if (!row) throw new Error(`no hashline row contains: ${needle}`)
    return row.split("|")[0] as string
  }

  test("surfaces contract warnings after a valid edit (WARN-first, non-blocking)", async () => {
    //#given a plan whose first line is a canonical section heading
    const content = ["## TL;DR", "summary", "", "## Context", "", "- [ ] 1. Do thing", ""].join("\n")
    await createTool.execute({ filePath: ".matrixx/plans/warn-plan.md", content }, ctx)
    const anchor = await anchorFor("warn-plan.md", "## TL;DR")

    //#when the canonical heading is replaced with a plain line
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: ".matrixx/plans/warn-plan.md", edits: [{ op: "replace", pos: anchor, lines: ["TLDR removed"] }] },
        ctx,
      ),
    )

    //#then the edit still succeeds and the drift is reported as a warning
    expect(res.success).toBe(true)
    expect(res.error).toBeUndefined()
    expect(Array.isArray(res.warnings)).toBe(true)
    const missing = (res.warnings as Array<{ code: string; message: string }>).find((w) => w.code === "missing_section")
    expect(missing).toBeDefined()
    expect(missing?.message).toContain("TL;DR")
    //#and the edit is persisted
    expect(readFileSync(planPath(testDir, "warn-plan.md"), "utf-8")).toContain("TLDR removed")
  })

  test("rejects an oversize edit with size_exceeded and leaves the file unchanged", async () => {
    //#given a small plan and its exact pre-edit bytes
    await createTool.execute({ filePath: ".matrixx/plans/cap-plan.md", content: "# Title\nline2\n" }, ctx)
    const target = planPath(testDir, "cap-plan.md")
    const before = readFileSync(target, "utf-8")
    const beforeSize = statSync(target).size
    const anchor = await anchorFor("cap-plan.md", "# Title")

    //#when an edit appends more than the hard cap
    const res = JSON.parse(
      await updateTool.execute(
        {
          filePath: ".matrixx/plans/cap-plan.md",
          edits: [{ op: "append", pos: anchor, lines: ["x".repeat(MAX_PLAN_FILE_BYTES + 100)] }],
        },
        ctx,
      ),
    )

    //#then a hard rejection with a split hint, and nothing was persisted
    expect(res.error).toBe("size_exceeded")
    expect(res.message).toMatch(/split the plan/i)
    expect(typeof res.hint).toBe("string")
    expect(res.hint.length).toBeGreaterThan(0)
    expect(readFileSync(target, "utf-8")).toBe(before)
    expect(statSync(target).size).toBe(beforeSize)
  })

  test("enforces the byte cap for multibyte content (char count under cap, byte count over)", async () => {
    //#given a small plan and its exact pre-edit bytes
    await createTool.execute({ filePath: ".matrixx/plans/byte-cap-plan.md", content: "# Title\nline2\n" }, ctx)
    const target = planPath(testDir, "byte-cap-plan.md")
    const before = readFileSync(target, "utf-8")
    const beforeSize = statSync(target).size
    const anchor = await anchorFor("byte-cap-plan.md", "# Title")

    //#when an edit appends a 3-byte-per-char run under the cap in chars but over it in bytes
    const multibyte = "€".repeat(Math.ceil((MAX_PLAN_FILE_BYTES + 500) / 3))
    const res = JSON.parse(
      await updateTool.execute(
        { filePath: ".matrixx/plans/byte-cap-plan.md", edits: [{ op: "append", pos: anchor, lines: [multibyte] }] },
        ctx,
      ),
    )

    //#then the byte cap still rejects it and the file is left unchanged
    expect(res.error).toBe("size_exceeded")
    expect(readFileSync(target, "utf-8")).toBe(before)
    expect(statSync(target).size).toBe(beforeSize)
  })

  test("injects front-matter once on the first edit and not again (idempotent)", async () => {
    //#given a plan without front-matter
    await createTool.execute({ filePath: ".matrixx/plans/fm-plan.md", content: "# Title\nline2\nline3\n" }, ctx)
    const target = planPath(testDir, "fm-plan.md")
    expect(parsePlanFrontMatter(readFileSync(target, "utf-8"))).toBeNull()

    //#when the first edit lands
    const firstAnchor = await anchorFor("fm-plan.md", "# Title")
    const first = JSON.parse(
      await updateTool.execute(
        { filePath: ".matrixx/plans/fm-plan.md", edits: [{ op: "replace", pos: firstAnchor, lines: ["# First Edit"] }] },
        ctx,
      ),
    )

    //#then front-matter is present exactly once
    expect(first.success).toBe(true)
    expect(first.frontMatterInjected).toBe(true)
    const afterFirst = readFileSync(target, "utf-8")
    expect(parsePlanFrontMatter(afterFirst)?.status).toBe("pending")
    expect(frontMatterFences(afterFirst)).toBe(2)

    //#when a second edit lands (anchor re-read after the front-matter shift)
    const secondAnchor = await anchorFor("fm-plan.md", "# First Edit")
    const second = JSON.parse(
      await updateTool.execute(
        { filePath: ".matrixx/plans/fm-plan.md", edits: [{ op: "replace", pos: secondAnchor, lines: ["# Second Edit"] }] },
        ctx,
      ),
    )

    //#then no duplicate front-matter block is added
    expect(second.success).toBe(true)
    expect(second.frontMatterInjected).toBe(false)
    const afterSecond = readFileSync(target, "utf-8")
    expect(frontMatterFences(afterSecond)).toBe(2)
    expect(afterSecond).toContain("# Second Edit")
  })
})
