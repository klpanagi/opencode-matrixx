/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MAX_PLAN_FILE_BYTES } from "../../../src/tools/plan/constants"
import {
  classifyReadRefusal,
  fileTooLargePayload,
  PLAN_ERROR_CODES,
  PLAN_ERROR_MEANINGS,
  PLAN_ERROR_RETRYABLE,
  readFailedPayload,
} from "../../../src/tools/plan/error-codes"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"

const TEST_ABORT = new AbortController()

function testContext(testDir: string) {
  return {
    sessionID: "test-session-plan-error-codes",
    messageID: "test-message-plan-error-codes",
    agent: "test-agent",
    abort: TEST_ABORT.signal,
    directory: testDir,
  }
}

function writePlan(dir: string, name: string, content: string): void {
  mkdirSync(join(dir, ".matrixx/plans"), { recursive: true })
  writeFileSync(join(dir, ".matrixx/plans", name), content, "utf-8")
}

function buildOversizedContent(): string {
  return `${"# Oversized Plan\n\n"}${"- [ ] 1. filler: ".repeat(1)}${"z".repeat(MAX_PLAN_FILE_BYTES + 1_000)}\n`
}

const isRoot = typeof process.getuid === "function" && process.getuid() === 0

describe("plan error-code taxonomy", () => {
  test("every declared code has a documented meaning and a retryable flag", () => {
    //#given
    const codes = Object.values(PLAN_ERROR_CODES)

    //#when
    const missing = codes.filter(
      (code) => !PLAN_ERROR_MEANINGS[code] || PLAN_ERROR_RETRYABLE[code] === undefined,
    )

    //#then
    expect(codes.length).toBe(10)
    expect(missing).toEqual([])
  })

  test("size refusals are retryable, argument refusals are not", () => {
    //#given
    const codes = Object.values(PLAN_ERROR_CODES)

    //#when
    const retryable = codes.filter((code) => PLAN_ERROR_RETRYABLE[code] === true)

    //#then
    expect(retryable.sort()).toEqual(["file_too_large", "section_stale"])
  })

  test("section codes are reserved and declared but not yet produced", () => {
    //#given
    const reserved = [
      PLAN_ERROR_CODES.sectionStale,
      PLAN_ERROR_CODES.sectionNotFound,
      PLAN_ERROR_CODES.sectionAmbiguous,
    ]

    //#when
    const keys = Object.keys(PLAN_ERROR_CODES) as Array<keyof typeof PLAN_ERROR_CODES>

    //#then
    expect(reserved).toEqual(["section_stale", "section_not_found", "section_ambiguous"])
    for (const code of reserved) {
      expect(keys.length).toBe(10)
      expect(PLAN_ERROR_MEANINGS[code]).toBeTruthy()
      expect(Object.values(PLAN_ERROR_CODES)).toContain(code)
    }
  })

  test("file_too_large payload names a concrete recovery action", () => {
    //#given
    const filePath = "/tmp/.matrixx/plans/big.md"

    //#when
    const payload = JSON.parse(fileTooLargePayload(filePath, 500_000, MAX_PLAN_FILE_BYTES))

    //#then
    expect(payload.error).toBe("file_too_large")
    expect(payload.hint).toContain("plan_read")
    expect(payload.hint).toContain("offset")
    expect(payload.hint).toContain("limit")
    expect(payload.hint).toContain("section")
  })

  test("read_failed payload no longer claims 'too large or unreadable'", () => {
    //#given
    const filePath = "/tmp/.matrixx/plans/big.md"

    //#when
    const payload = JSON.parse(readFailedPayload(filePath))

    //#then
    expect(payload.error).toBe("read_failed")
    expect(payload.message).not.toContain("too large")
  })

  test("classifyReadRefusal separates EACCES from oversize", () => {
    //#given
    //#when
    const denied = classifyReadRefusal({ sizeOverCap: null, errno: "EACCES" })
    const oversized = classifyReadRefusal({ sizeOverCap: 500_000, errno: null })

    //#then
    expect(denied).toBe("read_failed")
    expect(oversized).toBe("file_too_large")
  })

  test("classifyReadRefusal reports file_too_large when stat succeeded and no errno", () => {
    //#given
    const overCap = MAX_PLAN_FILE_BYTES + 1

    //#when
    const code = classifyReadRefusal({ sizeOverCap: overCap, errno: null })

    //#then
    expect(code).toBe("file_too_large")
  })
})

describe("plan_read refuses too-large and unreadable files with distinct codes", () => {
  let testDir: string
  let tool: ReturnType<typeof createPlanReadTool>

  beforeEach(() => {
    testDir = join(tmpdir(), `plan-errcodes-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(testDir, ".matrixx/plans"), { recursive: true })
    tool = createPlanReadTool()
  })

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
  })

  test("an over-cap read returns file_too_large with an actionable hint", async () => {
    //#given
    writePlan(testDir, "oversized.md", buildOversizedContent())

    //#when
    const result = await tool.execute({ filePath: ".matrixx/plans/oversized.md" }, testContext(testDir))
    const parsed = JSON.parse(result)

    //#then
    expect(parsed.error).toBe("file_too_large")
    expect(parsed.hint).toContain("offset")
    expect(parsed.hint).toContain("limit")
    expect(parsed.size).toBeGreaterThan(MAX_PLAN_FILE_BYTES)
  })

  test.skipIf(isRoot)("a permissions-denied read returns read_failed", async () => {
    //#given
    const name = "locked.md"
    writePlan(testDir, name, "# Locked Plan\n")
    const target = join(testDir, ".matrixx/plans", name)
    chmodSync(target, 0o000)

    //#when
    const result = await tool.execute({ filePath: `.matrixx/plans/${name}` }, testContext(testDir))
    chmodSync(target, 0o600)
    const parsed = JSON.parse(result)

    //#then
    expect(parsed.error).toBe("read_failed")
    expect(parsed.message).not.toContain("too large")
  })

  test("an over-cap file that is also permission-denied still refuses distinctly", async () => {
    //#given
    const name = "oversized-locked.md"
    writePlan(testDir, name, buildOversizedContent())
    const target = join(testDir, ".matrixx/plans", name)
    chmodSync(target, 0o000)

    //#when
    const result = await tool.execute(
      { filePath: `.matrixx/plans/${name}` },
      testContext(testDir),
    )
    chmodSync(target, 0o600)
    const parsed = JSON.parse(result)

    //#then
    if (isRoot) {
      // Running as root bypasses mode bits, so the size refusal is what fires.
      expect(parsed.error).toBe("file_too_large")
    } else {
      expect(["read_failed", "file_too_large"]).toContain(parsed.error)
    }
    expect(parsed.error).not.toBe("read_failed (too large or unreadable)")
  })
})
