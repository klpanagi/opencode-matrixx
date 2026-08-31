import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"

// ---------------------------------------------------------------------------
// Mock Bun.spawnSync (default: fail)
// ---------------------------------------------------------------------------
const origSpawnSync = Bun.spawnSync

let mockResults: Array<{ exitCode: number; stdout: string; stderr: string }> = []

beforeEach(() => {
  mockResults = []
  Bun.spawnSync = mock((_cmd: string[], _opts?: any) => {
    const result = mockResults.shift() ?? { exitCode: 1, stdout: "", stderr: "" }
    return {
      exitCode: result.exitCode,
      stdout: Buffer.from(result.stdout),
      stderr: Buffer.from(result.stderr),
    }
  }) as any
})

afterAll(() => {
  Bun.spawnSync = origSpawnSync
  mock.restore()
})

import { runDoctor, executeDoctor } from "../../../src/cli/doctor"
import type { DoctorReport } from "../../../src/cli/doctor/types"

describe("runDoctor", () => {
  test("returns a report structure with 5 checks", async () => {
    const report = await runDoctor()
    expect(report).toHaveProperty("timestamp")
    expect(report).toHaveProperty("checks")
    expect(report).toHaveProperty("summary")
    expect(Array.isArray(report.checks)).toBe(true)
    expect(report.checks.length).toBe(6)
  })

  test("report has correct summary totals", async () => {
    const report = await runDoctor()
    expect(report.summary.total).toBe(report.checks.length)
    expect(report.summary.passed + report.summary.warnings + report.summary.failed).toBe(
      report.summary.total,
    )
  })

  test("category filter returns subset with correct category", async () => {
    const report = await runDoctor({ category: "configuration" })
    expect(report.checks.length).toBeGreaterThanOrEqual(1)
    for (const c of report.checks) {
      expect(c.category).toBe("configuration")
    }
  })

  test("category filter with unknown category returns empty", async () => {
    const report = await runDoctor({ category: "nonexistent" })
    expect(report.checks.length).toBe(0)
    expect(report.summary.total).toBe(0)
  })

  test("handles check exceptions gracefully", async () => {
    Bun.spawnSync = mock(() => {
      throw new Error("unexpected error")
    }) as any

    const report = await runDoctor()
    const failedChecks = report.checks.filter((c) => c.status === "fail")
    expect(failedChecks.length).toBeGreaterThan(0)
  })
})

describe("executeDoctor", () => {
  test("returns formatted text by default", async () => {
    const output = await executeDoctor()
    expect(typeof output).toBe("string")
    expect(output).toContain("Matrixx Doctor")
    expect(output).toContain("Summary")
  })

  test("returns JSON with --json flag", async () => {
    const output = await executeDoctor({ json: true })
    const parsed = JSON.parse(output) as DoctorReport
    expect(parsed).toHaveProperty("timestamp")
    expect(parsed).toHaveProperty("checks")
    expect(parsed).toHaveProperty("summary")
  })
})
