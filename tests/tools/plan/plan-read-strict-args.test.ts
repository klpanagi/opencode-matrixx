/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { computeLineHash } from "../../../src/tools/hashline-edit/hash-computation"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"

const TEST_ABORT = new AbortController()

function testContext(testDir: string) {
  return {
    sessionID: "test-session-plan-read-strict",
    messageID: "test-message-plan-read-strict",
    agent: "test-agent",
    abort: TEST_ABortSignal(),
    directory: testDir,
  }
}

function TEST_ABortSignal(): AbortSignal {
  return TEST_ABORT.signal
}

function writePlan(dir: string, name: string, content: string): void {
  mkdirSync(join(dir, ".matrixx/plans"), { recursive: true })
  writeFileSync(join(dir, ".matrixx/plans", name), content, "utf-8")
}

const PLAN_BODY = "# H1\nline2\nline3\nline4\nline5\n"

describe("plan_read strict offset/limit arguments", () => {
  let testDir: string
  let tool: ReturnType<typeof createPlanReadTool>

  beforeEach(() => {
    testDir = join(tmpdir(), `plan-read-strict-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(testDir, ".matrixx/plans"), { recursive: true })
    writePlan(testDir, "strict-plan.md", PLAN_BODY)
    tool = createPlanReadTool()
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("offset 0 is rejected with validation_error instead of reading the whole file", async () => {
    //#given a five-line plan read with an off-by-one offset of 0
    //#when plan_read is called with offset 0
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/strict-plan.md", offset: 0, limit: 10 }, testContext(testDir)),
    )
    //#then it is a validation_error naming offset and no file body is returned
    expect(res.error).toBe("validation_error")
    expect(res.argument).toBe("offset")
    expect(res.message).toContain("offset")
    expect(res.hashline).toBeUndefined()
    expect(res.content).toBeUndefined()
    expect(JSON.stringify(res)).not.toContain("line5")
  })

  test("negative offset is rejected with validation_error", async () => {
    //#given a five-line plan
    //#when plan_read is called with a negative offset
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/strict-plan.md", offset: -3 }, testContext(testDir)),
    )
    //#then it is a validation_error naming offset
    expect(res.error).toBe("validation_error")
    expect(res.argument).toBe("offset")
    expect(res.hashline).toBeUndefined()
  })

  test("non-finite offset is rejected with validation_error", async () => {
    //#given a five-line plan
    //#when plan_read is called with NaN
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/strict-plan.md", offset: Number.NaN }, testContext(testDir)),
    )
    //#then it is a validation_error naming offset
    expect(res.error).toBe("validation_error")
    expect(res.argument).toBe("offset")
  })

  test("non-numeric limit is rejected with validation_error naming limit", async () => {
    //#given a five-line plan
    //#when plan_read is called with a string limit
    const res = JSON.parse(
      await tool.execute(
        { filePath: ".matrixx/plans/strict-plan.md", limit: "abc" },
        testContext(testDir),
      ),
    )
    //#then it is a validation_error naming limit
    expect(res.error).toBe("validation_error")
    expect(res.argument).toBe("limit")
    expect(res.hashline).toBeUndefined()
  })

  test("non-positive limit is rejected with validation_error naming limit", async () => {
    //#given a five-line plan
    //#when plan_read is called with limit 0
    const res = JSON.parse(
      await tool.execute({ filePath: ".matrixx/plans/strict-plan.md", limit: 0 }, testContext(testDir)),
    )
    //#then it is a validation_error naming limit
    expect(res.error).toBe("validation_error")
    expect(res.argument).toBe("limit")
  })

  test("omitted offset and limit keep the default whole-file behaviour", async () => {
    //#given a five-line plan read with no pagination arguments
    //#when plan_read is called with filePath only
    const res = JSON.parse(await tool.execute({ filePath: ".matrixx/plans/strict-plan.md" }, testContext(testDir)))
    //#then the whole file is returned as hashline with no error
    expect(res.error).toBeUndefined()
    expect(res.filePath).toContain("strict-plan.md")
    const expected = PLAN_BODY.split("\n")
      .map((line, index) => `${index + 1}#${computeLineHash(index + 1, line)}|${line}`)
      .join("\n")
    expect(res.hashline).toBe(expected)
  })

  test("valid offset and limit still paginate unchanged", async () => {
    //#given a five-line plan
    //#when plan_read is called with offset 3 and limit 2
    const res = JSON.parse(
      await tool.execute(
        { filePath: ".matrixx/plans/strict-plan.md", format: "content", offset: 3, limit: 2 },
        testContext(testDir),
      ),
    )
    //#then only lines 3 and 4 come back
    expect(res.content).toBe("line3\nline4")
  })
})
