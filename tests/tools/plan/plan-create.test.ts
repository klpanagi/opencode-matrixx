/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import {
  countPlanProgressFromContent,
  MAX_PLAN_FILE_BYTES,
  parseMetadataComment,
} from "../../../src/features/mission-state"
import { createPlanCreateTool } from "../../../src/tools/plan/plan-create"

const TEST_ABORT = new AbortController()

function testContext(testDir: string): ToolContext {
  return {
    sessionID: "test-session-plan-create",
    messageID: "test-message-plan-create",
    agent: "test-agent",
    abort: TEST_ABORT.signal,
    directory: testDir,
    worktree: testDir,
    metadata: () => {},
    ask: async () => {},
  }
}

describe("plan_create validation + size cap", () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `plan-create-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(testDir, ".matrixx/plans"), { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("rejects content over the 102400-byte cap with size_exceeded", async () => {
    //#given content larger than the hard cap
    const content = `# T\n\n${"x".repeat(MAX_PLAN_FILE_BYTES + 100)}`
    const createTool = createPlanCreateTool()
    const planPath = join(testDir, ".matrixx/plans/probe.md")

    //#when create
    const res = JSON.parse(
      await createTool.execute({ filePath: ".matrixx/plans/probe.md", content }, testContext(testDir)),
    )

    //#then hard rejection with a split hint, and nothing persisted
    expect(res.error).toBe("size_exceeded")
    expect(res.message).toMatch(/split the plan/i)
    expect(typeof res.hint).toBe("string")
    expect(res.hint.length).toBeGreaterThan(0)
    expect(existsSync(planPath)).toBe(false)
  })

  test("counts the appended metadata comment so it never persists a plan plan_read would reject", async () => {
    //#given content just under the cap in chars whose stored form plus metadata exceeds it in bytes
    const content = "x".repeat(MAX_PLAN_FILE_BYTES - 50)
    const createTool = createPlanCreateTool()
    const planPath = join(testDir, ".matrixx/plans/boundary-plan.md")

    //#when create
    const res = JSON.parse(
      await createTool.execute({ filePath: ".matrixx/plans/boundary-plan.md", content }, testContext(testDir)),
    )

    //#then the byte cap accounts for the metadata comment and nothing is persisted
    expect(res.error).toBe("size_exceeded")
    expect(existsSync(planPath)).toBe(false)
  })

  test("keeps a successfully created plan within the byte cap (readable by plan_read)", async () => {
    //#given content comfortably under the cap
    const content = `# Small\n\n${"y".repeat(MAX_PLAN_FILE_BYTES - 2000)}`
    const createTool = createPlanCreateTool()
    const planPath = join(testDir, ".matrixx/plans/roundtrip-plan.md")

    //#when create
    const res = JSON.parse(
      await createTool.execute({ filePath: ".matrixx/plans/roundtrip-plan.md", content }, testContext(testDir)),
    )

    //#then it succeeds and the stored bytes stay within the cap plan_read enforces
    expect(res.success).toBe(true)
    expect(statSync(planPath).size).toBeLessThanOrEqual(MAX_PLAN_FILE_BYTES)
  })

  test("stores SSOT progress metadata (numbered-only, indented boxes ignored)", async () => {
    //#given a plan whose indented box would diverge from the SSOT numbered-only count
    const content = [
      "# Contract Plan",
      "",
      "## TODOs",
      "- [x] 1. First task",
      "- [ ] 2. Second task",
      "- [ ] 3. Third task",
      "  - [x] 3.1 nested box must not count",
      "",
    ].join("\n")
    const expected = countPlanProgressFromContent(content)
    const createTool = createPlanCreateTool()

    //#when create
    const res = JSON.parse(
      await createTool.execute({ filePath: ".matrixx/plans/contract-plan.md", content }, testContext(testDir)),
    )

    //#then success and the stored metadata equals the SSOT
    expect(res.error).toBeUndefined()
    expect(res.success).toBe(true)
    const stored = parseMetadataComment(
      readFileSync(join(testDir, ".matrixx/plans/contract-plan.md"), "utf-8"),
    )
    expect(stored).toBeTruthy()
    expect(stored?.todoTotal).toBe(expected.total)
    expect(stored?.todoCompleted).toBe(expected.completed)
    expect(stored?.todoTotal).toBe(3)
    expect(stored?.todoCompleted).toBe(1)
  })

  test("drifted content succeeds WITH warnings (WARN-first, non-blocking)", async () => {
    //#given a minimal plan missing the canonical sections
    const content = "# Drifted\n\n- [ ] 1. Something\n"
    const createTool = createPlanCreateTool()

    //#when create
    const res = JSON.parse(
      await createTool.execute({ filePath: ".matrixx/plans/drifted-plan.md", content }, testContext(testDir)),
    )

    //#then success, warnings surfaced, and the file is still persisted
    expect(res.success).toBe(true)
    expect(res.error).toBeUndefined()
    expect(Array.isArray(res.warnings)).toBe(true)
    expect(res.warnings.length).toBeGreaterThan(0)
    expect(existsSync(join(testDir, ".matrixx/plans/drifted-plan.md"))).toBe(true)
  })

  test("grandfathered content lacking front-matter is not rejected", async () => {
    //#given legacy plan content with no YAML front-matter
    const content = "# Legacy\n\n## TODOs\n- [ ] 1. Legacy task\n"
    const createTool = createPlanCreateTool()

    //#when create
    const res = JSON.parse(
      await createTool.execute({ filePath: ".matrixx/plans/legacy-plan.md", content }, testContext(testDir)),
    )

    //#then accepted without hard failure
    expect(res.success).toBe(true)
    expect(res.error).toBeUndefined()
  })
})
