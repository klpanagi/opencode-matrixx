/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MAX_PLAN_FILE_BYTES, MAX_PLAN_READ_RENDERED_BYTES } from "../../../src/tools/plan/constants"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"

const TEST_ABORT = new AbortController()
function testContext(testDir: string) {
  return {
    sessionID: "test-session-plan-read",
    messageID: "test-message-plan-read",
    agent: "test-agent",
    abort: TEST_ABORT.signal,
    directory: testDir,
  }
}

function writePlan(dir: string, name: string, content: string): void {
  mkdirSync(join(dir, ".matrixx/plans"), { recursive: true })
  writeFileSync(join(dir, ".matrixx/plans", name), content, "utf-8")
}

/** Synthesized CI fixture (repo fixture is gitignored): 480 lines ≈ 33.4KB rendered, under the 40,000 soft cap. */
function buildNearCapContent(): string {
  const lines: string[] = ["# Near Cap Plan", "", "## Section One", ""]
  for (let i = 1; i <= 480; i++) {
    lines.push(`- [ ] ${i}. task-${i}: ${"z".repeat(40)}`)
  }
  return `${lines.join("\n")}\n`
}

/** ~63KB body (under hard cap): selected hashline payload exceeds the soft cap. */
function buildOverCapContent(): string {
  const lines: string[] = ["# Over Cap Plan", "", "## Section One", ""]
  for (let i = 1; i <= 900; i++) {
    if (i % 100 === 0) lines.push(`## Section ${i / 100}`)
    lines.push(`- [ ] ${i}. task-${i}: ${"q".repeat(50)}`)
  }
  return `${lines.join("\n")}\n`
}

describe("plan_read single-format contract", () => {
  let testDir: string
  let tool: ReturnType<typeof createPlanReadTool>

  beforeEach(() => {
    testDir = join(tmpdir(), `plan-read-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(testDir, ".matrixx/plans"), { recursive: true })
    tool = createPlanReadTool()
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("default format returns hashline and never content", async () => {
    //#given a small plan file
    writePlan(testDir, "sample-plan.md", "# Title\nline2\n- [ ] 1. Do thing\n")
    //#when read with defaults
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/sample-plan.md" }, testContext(testDir)),
    )
    //#then only hashline is present
    expect("hashline" in res).toBe(true)
    expect("content" in res).toBe(false)
    expect(res.hashline).toContain("1#")
    expect(res.hashline).toContain("|# Title")
  })

  test("format content returns content and never hashline", async () => {
    //#given a small plan file
    writePlan(testDir, "sample-plan.md", "# Title\nline2\n- [ ] 1. Do thing\n")
    //#when read with content format
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/sample-plan.md", format: "content" }, testContext(testDir)),
    )
    //#then only content is present
    expect("content" in res).toBe(true)
    expect("hashline" in res).toBe(false)
    expect(res.content).toContain("# Title")
  })

  test("repo fixture evolution-advancement-proposal.md renders under the soft cap", async () => {
    //#given the repo-local near-cap fixture when present, else an equivalent synthesized file
    const repoFixture = join(process.cwd(), ".matrixx/plans/evolution-advancement-proposal.md")
    const content = existsSync(repoFixture) ? readFileSync(repoFixture, "utf-8") : buildNearCapContent()
    writePlan(testDir, "evolution-advancement-proposal.md", content)
    //#when read with the default format
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/evolution-advancement-proposal.md" }, testContext(testDir)),
    )
    //#then the selected format key is present and the rendered payload fits
    expect(res.truncated).toBeUndefined()
    expect("hashline" in res).toBe(true)
    expect("content" in res).toBe(false)
    expect(JSON.stringify(res).length).toBeLessThan(MAX_PLAN_READ_RENDERED_BYTES)
  })

  test("selected-format payload over the soft cap returns truncated + outline + hint", async () => {
    //#given a valid plan whose hashline payload exceeds the soft cap
    writePlan(testDir, "over-cap-plan.md", buildOverCapContent())
    //#when read with the default format
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/over-cap-plan.md" }, testContext(testDir)),
    )
    //#then a truncation envelope with neither payload key
    expect(res.truncated).toBe(true)
    expect("content" in res).toBe(false)
    expect("hashline" in res).toBe(false)
    expect(Array.isArray(res.outline)).toBe(true)
    expect(res.outline.length).toBeGreaterThan(0)
    expect(res.hint).toContain("plan_tasks")
  })

  test("outline carries H2 headings and numbered task titles with anchors", async () => {
    //#given a valid plan whose hashline payload exceeds the soft cap
    writePlan(testDir, "over-cap-plan.md", buildOverCapContent())
    //#when read, forcing truncation
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/over-cap-plan.md" }, testContext(testDir)),
    )
    //#then the outline exposes absolute anchors for sections and tasks
    const section = res.outline.find((entry: { level: number; text: string }) => entry.level === 2)
    const task = res.outline.find((entry: { level: number; text: string }) => entry.level === 3)
    expect(section).toBeDefined()
    expect(section.anchor).toMatch(/^\d+#/)
    expect(task).toBeDefined()
    expect(task.anchor).toMatch(/^\d+#/)
  })

  test("file over the hard cap returns file_too_large with a split hint", async () => {
    //#given a valid-kebab plan whose content exceeds the hard cap
    writePlan(testDir, "huge-plan.md", "x".repeat(MAX_PLAN_FILE_BYTES + 100))
    //#when read
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/huge-plan.md" }, testContext(testDir)),
    )
    //#then the hard-cap error carries a hint
    expect(res.error).toBe("file_too_large")
    expect(typeof res.hint).toBe("string")
    expect(res.hint.length).toBeGreaterThan(0)
  })

  test("offset/limit paginate by line and returned anchors stay absolute", async () => {
    //#given a five-line plan
    writePlan(testDir, "page-plan.md", "# H1\nline2\nline3\nline4\nline5\n")
    //#when read hashline for lines 3..4
    const hashRes = JSON.parse(
      await tool.execute(
        { filePath: ".matrixx/plans/page-plan.md", format: "hashline", offset: 3, limit: 2 },
        testContext(testDir),
      ),
    )
    //#then exactly two lines with absolute anchors 3 and 4
    const hashLines = hashRes.hashline.split("\n")
    expect(hashLines.length).toBe(2)
    expect(hashLines[0].startsWith("3#")).toBe(true)
    expect(hashLines[1].startsWith("4#")).toBe(true)
    expect(hashLines[0]).toContain("line3")
    expect(hashLines[1]).toContain("line4")

    //#when read content for lines 3..4
    const contentRes = JSON.parse(
      await tool.execute(
        { filePath: ".matrixx/plans/page-plan.md", format: "content", offset: 3, limit: 2 },
        testContext(testDir),
      ),
    )
    //#then only the selected lines are returned
    expect(contentRes.content).toBe("line3\nline4")
  })
})
