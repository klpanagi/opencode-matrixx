/// <reference types="bun-types" />
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { dryRunMigrationReport } from "../../../src/features/plan-contract/migration-report"

const TEST_ROOT = ".test-migration-report"

function writePlan(name: string, content: string): string {
  const dir = join(TEST_ROOT, ".matrixx", "plans")
  mkdirSync(dir, { recursive: true })
  const file = join(dir, name)
  writeFileSync(file, content, "utf-8")
  return file
}

beforeEach(() => {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true })
  mkdirSync(TEST_ROOT, { recursive: true })
})

afterEach(() => {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true })
})

describe("dryRunMigrationReport", () => {
  test("writes nothing: mtimes unchanged across a dry run", () => {
    //#given
    const file = writePlan(
      "legacy-plan.md",
      "# Plan\n\n- [ ] 1. First task\n- [ ] 2. Second task\n\n<!-- plan-persister: {} -->\n",
    )
    const before = statSync(file).mtimeMs

    //#when
    const report = dryRunMigrationReport(TEST_ROOT)

    //#then
    expect(Array.isArray(report)).toBe(true)
    expect(statSync(file).mtimeMs).toBe(before)
  })

  test("zero-task fixture routes to archive-candidate, never complete", () => {
    //#given
    writePlan("dwfinance-design.md", "# Design doc\n\nNo numbered tasks here, just prose.\n")

    //#when
    const report = dryRunMigrationReport(TEST_ROOT)
    const entry = report.find((r) => r.plan === "dwfinance-design.md")

    //#then
    expect(entry).toBeDefined()
    expect(entry?.progress.total).toBe(0)
    expect(entry?.recommendation).toBe("archive-candidate")
    expect(entry?.recommendation).not.toBe("complete")
  })

  test("legacy numbered plan recommends apply-on-touch with front-matter state", () => {
    //#given
    writePlan(
      "numbered-legacy.md",
      "# Plan\n\n- [x] 1. Done\n- [ ] 2. Todo\n\n<!-- plan-persister: {} -->\n",
    )

    //#when
    const report = dryRunMigrationReport(TEST_ROOT)
    const entry = report.find((r) => r.plan === "numbered-legacy.md")

    //#then
    expect(entry?.hasFrontMatter).toBe(false)
    expect(entry?.progress).toMatchObject({ total: 2, completed: 1 })
    expect(entry?.recommendation).toBe("apply-on-touch")
  })

  test("modern plan with front-matter recommends none", () => {
    //#given
    writePlan(
      "modern-plan.md",
      '---\nstatus: "in_progress"\nrevision: 1\n---\n\n# Plan\n\n- [x] 1. Done\n- [ ] 2. Todo\n',
    )

    //#when
    const report = dryRunMigrationReport(TEST_ROOT)
    const entry = report.find((r) => r.plan === "modern-plan.md")

    //#then
    expect(entry?.hasFrontMatter).toBe(true)
    expect(entry?.state).toBe("modern")
    expect(entry?.recommendation).toBe("none")
  })
})
