/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { countPlanProgressFromContent } from "../../../src/features/mission-state"
import { MAX_PLAN_FILE_BYTES } from "../../../src/tools/plan/constants"
import { createPlanTasksTool } from "../../../src/tools/plan/plan-tasks"

const TEST_ABORT = new AbortController()

function testContext(testDir: string) {
  return {
    sessionID: "test-session-plan-tasks",
    messageID: "test-message-plan-tasks",
    agent: "test-agent",
    abort: TEST_ABORT.signal,
    directory: testDir,
  }
}

function writePlan(dir: string, name: string, content: string): void {
  mkdirSync(join(dir, ".matrixx/plans"), { recursive: true })
  Bun.write(join(dir, ".matrixx/plans", name), content)
}

/** Exactly 13 numbered tasks plus a Definition of Done block. */
function buildThirteenTaskPlan(): string {
  const lines = ["# Thirteen Task Plan", "", "## TODOs", ""]
  for (let i = 1; i <= 13; i++) {
    lines.push(`- [${i % 3 === 0 ? "x" : " "}] ${i}. Task number ${i}`)
  }
  lines.push("", "## Definition of Done", "", "- [ ] All tasks complete", "- [x] Verified", "")
  return lines.join("\n")
}

interface ManifestResult {
  filePath: string
  progress: {
    total: number
    completed: number
    remaining: number
    isComplete: boolean
    needsTriage?: boolean
  }
  tasks: Array<{ n: number; title: string; checked: boolean; line: number; anchor: string }>
  dod: string[]
  error?: string
  hint?: string
  size?: number
}

describe("plan_tasks compact manifest", () => {
  let testDir: string
  let tool: ReturnType<typeof createPlanTasksTool>

  beforeEach(() => {
    testDir = join(tmpdir(), `plan-tasks-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(testDir, ".matrixx/plans"), { recursive: true })
    tool = createPlanTasksTool()
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("returns filePath, progress, tasks, dod and never full plan content", async () => {
    //#given a small numbered plan
    writePlan(testDir, "sample-plan.md", buildThirteenTaskPlan())
    //#when requested
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/sample-plan.md" }, testContext(testDir)),
    ) as ManifestResult
    //#then the compact manifest shape is present and no raw payload leaks
    expect(res.filePath.endsWith("sample-plan.md")).toBe(true)
    expect(res.progress.total).toBe(13)
    expect(res.progress.remaining).toBe(res.progress.total - res.progress.completed)
    expect(Array.isArray(res.tasks)).toBe(true)
    expect(Array.isArray(res.dod)).toBe(true)
    expect(res.dod.length).toBe(2)
    expect("content" in res).toBe(false)
    expect("hashline" in res).toBe(false)
  })

  test("manifest stays under 8000 characters for a 13-task plan", async () => {
    //#given a 13-task plan
    writePlan(testDir, "sample-plan.md", buildThirteenTaskPlan())
    //#when requested
    const raw = await tool.execute({ filePath: ".matrixx/plans/sample-plan.md" }, testContext(testDir))
    //#then the serialized manifest is compact
    expect(raw.length).toBeLessThan(8000)
  })

  test("task count equals countPlanProgressFromContent total (repo fixture or synthesized 13-task)", async () => {
    //#given the repo fixture when present, otherwise an equivalent synthesized 13-task plan
    const repoFixture = join(process.cwd(), ".matrixx/plans/evolution-advancement-proposal.md")
    const content = existsSync(repoFixture) ? readFileSync(repoFixture, "utf-8") : buildThirteenTaskPlan()
    writePlan(testDir, "evolution-advancement-proposal.md", content)
    const expectedTotal = countPlanProgressFromContent(content).total
    //#when requested
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/evolution-advancement-proposal.md" }, testContext(testDir)),
    ) as ManifestResult
    //#then the task list and progress derive from the same SSOT
    expect(res.tasks.length).toBe(expectedTotal)
    expect(res.progress.total).toBe(expectedTotal)
    expect(res.tasks.length).toBe(13)
  })

  test("every task anchor is a valid LINE#ID token", async () => {
    //#given numbered tasks
    writePlan(testDir, "sample-plan.md", buildThirteenTaskPlan())
    //#when requested
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/sample-plan.md" }, testContext(testDir)),
    ) as ManifestResult
    //#then anchors are stable hashline references
    expect(res.tasks.length).toBe(13)
    for (const task of res.tasks) {
      expect(task.anchor).toMatch(/^\d+#[A-Z0-9]+$/)
      expect(task.line).toBeGreaterThan(0)
    }
  })

  test("zero-numbered plan reports needsTriage", async () => {
    //#given a plan without numbered tasks
    writePlan(testDir, "empty-plan.md", "# Empty\n\nNo tasks here yet.\n")
    //#when requested
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/empty-plan.md" }, testContext(testDir)),
    ) as ManifestResult
    //#then the manifest flags the plan for triage
    expect(res.progress.total).toBe(0)
    expect(res.progress.needsTriage).toBe(true)
    expect(res.tasks.length).toBe(0)
  })

  test("valid-kebab oversized file returns file_too_large with a split hint", async () => {
    //#given a valid-kebab plan whose content exceeds the hard cap
    writePlan(testDir, "huge-plan.md", "x".repeat(MAX_PLAN_FILE_BYTES + 100))
    //#when requested
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/huge-plan.md" }, testContext(testDir)),
    ) as ManifestResult
    //#then the hard-cap error carries a hint and the observed size
    expect(res.error).toBe("file_too_large")
    expect(typeof res.hint).toBe("string")
    expect(res.hint?.length).toBeGreaterThan(0)
    expect(res.size).toBeGreaterThan(MAX_PLAN_FILE_BYTES)
  })

  test("dotted filename is rejected first as invalid_file_path, never file_too_large", async () => {
    //#given an oversized file whose name is not kebab-case
    writePlan(testDir, "p2.2-generic-recovery-refactor.md", "x".repeat(MAX_PLAN_FILE_BYTES + 100))
    //#when requested
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/p2.2-generic-recovery-refactor.md" }, testContext(testDir)),
    ) as ManifestResult
    //#then the name is rejected before size is ever considered
    expect(res.error).toBe("invalid_file_path")
    expect(res.error).not.toBe("file_too_large")
  })

  test("missing file returns file_not_found", async () => {
    //#given no such plan file
    //#when requested
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/does-not-exist.md" }, testContext(testDir)),
    ) as ManifestResult
    //#then a not-found envelope is returned
    expect(res.error).toBe("file_not_found")
  })
})
