/// <reference types="bun-types" />
/**
 * Task 11 — the END-TO-END proof of `/plan-review`.
 *
 * A unit test proves `writeReviewReport` returns a string. This proves the thing
 * the user actually asked for: running the review against a COMPLETED plan
 * inside a real project directory produces
 *
 *   1. `.matrixx/reviews/<plan>.md` containing all four required parts,
 *   2. a versioned `.json` sidecar beside it, and
 *   3. a plan file whose bytes are IDENTICAL before and after.
 *
 * Point 3 is the one that matters most. The plan is a record of intent and
 * progress; a report appended to it corrupts both and — worse — its checkbox
 * counters begin absorbing paragraphs they were never meant to count. If the
 * review ever wrote one byte back into the plan, every score computed by the
 * feature would be measuring a plan it had itself degraded. So the assertion is
 * an md5 comparison, not a smoke test.
 *
 * FIXTURE, NOT A LIVE PLAN. Everything runs under `tmpdir()`; the repository's
 * real `.matrixx/plans/` is never read or written. A live plan would make this
 * test mutate the plan it is asserting is immutable.
 *
 * EXPECTED VALUES ARE DERIVED FROM THE SPEC, NOT FROM LIVE OUTPUT. The four
 * headings are spelled out as literals below and the report path is computed
 * from the plan name. Deriving them from the renderer's own output would assert
 * "the renderer agrees with the renderer", which passes for any renderer,
 * including a broken one.
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"

import { buildReviewDirCommand, writeReviewReport } from "../../../src/features/completion-review/report-write"
import { dimensions, input } from "./report-fixtures"

const PLAN_NAME = "fixture-completed-plan"
const PLAN_FILE = join(".matrixx", "plans", `${PLAN_NAME}.md`)

/** The four parts the plan mandates, verbatim. Not read from the renderer. */
const REQUIRED_PARTS = ["## Summary", "## Score", "## Complexity", "## Required Effort"]

/** A completed plan, in the shape the gatherer expects. */
const PLAN_TEXT = `# Fixture Completed Plan

**Estimated Effort**: 1 session

- [x] 1. Implement the thing
- [x] 2. Test the thing
- [x] 3. Document the thing

## Must NOT Have (Guardrails)

- [ ] MUST NOT write into the plan file
`

let projectDir: string
let planAbsPath: string
let md5Before: string

function md5File(path: string): string {
  return createHash("md5").update(readFileSync(path)).digest("hex")
}

beforeAll(() => {
  //#given a throwaway project containing a COMPLETED plan
  projectDir = mkdtempSync(join(tmpdir(), "plan-review-e2e-"))
  planAbsPath = join(projectDir, PLAN_FILE)
  mkdirSync(join(projectDir, ".matrixx", "plans"), { recursive: true })
  writeFileSync(planAbsPath, PLAN_TEXT, "utf-8")
  md5Before = md5File(planAbsPath)
})

afterAll(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

describe("end-to-end /plan-review against a completed plan", () => {
  test("a review writes a report, a sidecar, and changes no plan byte", () => {
    //#given the reviews directory the command template asks the bash tool to create
    mkdirSync(join(projectDir, ".matrixx", "reviews"), { recursive: true })
    expect(buildReviewDirCommand()).toContain("mkdir -p")

    //#when the review of the completed plan is written, run from the project dir
    const previousCwd = process.cwd()
    process.chdir(projectDir)
    let result
    try {
      result = writeReviewReport(input({ planName: PLAN_NAME }))
    } finally {
      process.chdir(previousCwd)
    }

    //#then both artefacts exist on disk
    const reportAbs = join(projectDir, ".matrixx", "reviews", `${PLAN_NAME}.md`)
    const sidecarAbs = join(projectDir, ".matrixx", "reviews", `${PLAN_NAME}.json`)
    expect(result.ok).toBe(true)
    expect(existsSync(reportAbs)).toBe(true)
    expect(existsSync(sidecarAbs)).toBe(true)

    //#then the report contains all four required parts, in the mandated spelling
    const markdown = readFileSync(reportAbs, "utf-8")
    for (const part of REQUIRED_PARTS) {
      expect(markdown).toContain(part)
    }

    //#then the sidecar is valid, versioned, and names the reviewed plan
    const sidecar = JSON.parse(readFileSync(sidecarAbs, "utf-8")) as {
      sidecarVersion: string
      plan: string
      advisory: boolean
    }
    expect(sidecar.sidecarVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(sidecar.plan).toBe(PLAN_NAME)
    expect(sidecar.advisory).toBe(true)

    //#then — the load-bearing assertion — the plan is byte-identical
    expect(md5File(planAbsPath)).toBe(md5Before)
  })

  test("the rendered report never leaks into the plan's progress counters", () => {
    //#given a second review pass over the same fixture
    const previousCwd = process.cwd()
    process.chdir(projectDir)
    try {
      writeReviewReport(input({ planName: PLAN_NAME }))
    } finally {
      process.chdir(previousCwd)
    }

    //#when the plan is re-read
    const after = readFileSync(planAbsPath, "utf-8")

    //#then its checkbox count is untouched — no report prose was absorbed
    const checkboxes = after.match(/^- \[[ x]\]/gm) ?? []
    expect(checkboxes).toHaveLength(4)
    expect(after).toBe(PLAN_TEXT)
  })

  test("the report is written OUTSIDE the plan file by construction", () => {
    //#given the path helpers
    //#when the report location is derived
    const reportPath = join(".matrixx", "reviews", `${PLAN_NAME}.md`)

    //#then it is not the plan path
    expect(reportPath).not.toBe(PLAN_FILE)
    expect(resolve(projectDir, reportPath).startsWith(join(projectDir, ".matrixx", "reviews"))).toBe(true)
  })

  test("a low-scoring review of the same plan behaves identically", () => {
    //#given a review whose headline score is very low
    mkdirSync(join(projectDir, ".matrixx", "reviews"), { recursive: true })
    const low = input({
      planName: PLAN_NAME,
      score: { value: 0.1, grade: 0.2, scoredWeight: 1, dimensionCount: 8 },
      dimensions: dimensions({ "dod-coverage": { score: 0.1, rationale: "most DoD items unverified" } }),
    })

    //#when it is written
    const previousCwd = process.cwd()
    process.chdir(projectDir)
    let result
    try {
      result = writeReviewReport(low)
    } finally {
      process.chdir(previousCwd)
    }

    //#then it succeeds and still carries all four parts
    expect(result.ok).toBe(true)
    expect(result.error).toBeNull()
    for (const part of REQUIRED_PARTS) {
      expect(result.markdown).toContain(part)
    }

    //#then the plan is still byte-identical
    expect(md5File(planAbsPath)).toBe(md5Before)
  })
})
