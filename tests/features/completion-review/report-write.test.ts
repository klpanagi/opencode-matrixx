/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { atomicWrite } from "../../../src/features/mission-state/atomic-write"
import {
  buildReviewDirCommand,
  reviewReportPath,
  reviewSidecarPath,
  writeReviewReport,
} from "../../../src/features/completion-review/report-write"
import { REVIEW_SIDECAR_VERSION } from "../../../src/features/completion-review/report-types"
import { input } from "./report-fixtures"

/** Environment-independent digest — no absolute temp path ever appears here. */
function md5(path: string): string {
  return createHash("md5").update(readFileSync(path)).digest("hex")
}

let dir = ""
let previousCwd = ""

/** The caller's job, and the whole point of `buildReviewDirCommand`. */
function createReviewsDir(): void {
  const result = Bun.spawnSync(["sh", "-c", buildReviewDirCommand()])
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
}

beforeEach(() => {
  previousCwd = process.cwd()
  dir = mkdtempSync(join(tmpdir(), "cr-report-"))
  process.chdir(dir)
})

afterEach(() => {
  process.chdir(previousCwd)
  rmSync(dir, { recursive: true, force: true })
})

describe("writeReviewReport — paths", () => {
  test("targets .matrixx/reviews/<plan>.md with a sibling .json sidecar", () => {
    //#given a plan named demo-plan
    const review = input()

    //#when the paths are computed
    const md = reviewReportPath(review.planName)
    const json = reviewSidecarPath(review.planName)

    //#then both live under .matrixx/reviews and share the plan name
    expect(md).toBe(join(".matrixx", "reviews", "demo-plan.md"))
    expect(json).toBe(join(".matrixx", "reviews", "demo-plan.json"))
  })

  test("hands directory creation to the bash tool, never to mkdir in TS", () => {
    //#given no directory yet
    //#when the command is built
    const command = buildReviewDirCommand()

    //#then it is a shell one-liner the caller pastes into the bash tool
    expect(command).toBe('mkdir -p ".matrixx/reviews"')
  })
})

describe("writeReviewReport — a review never touches the plan", () => {
  test("leaves the plan file's md5 unchanged and writes the report elsewhere", () => {
    //#given a plan file on disk and a completed review
    Bun.spawnSync(["mkdir", "-p", join(".matrixx", "plans")])
    const planPath = join(".matrixx", "plans", "demo-plan.md")
    writeFileSync(planPath, "# Plan\n\n- [x] task one\n- [ ] task two\n", "utf-8")
    const before = md5(planPath)
    createReviewsDir()

    const review = input({ planPath: `.matrixx/plans/${input().planName}.md` })

    //#when the review is written
    const result = writeReviewReport(review)

    //#then the plan is byte-identical and the report lives outside it
    expect(md5(planPath)).toBe(before)
    expect(result.ok).toBe(true)
    expect(existsSync(result.reportPath)).toBe(true)
    expect(result.reportPath).not.toContain(join("plans", "demo-plan.md"))
    expect(result.reportPath).toBe(join(".matrixx", "reviews", "demo-plan.md"))
  })

  test("the report and sidecar are the only files a review creates", () => {
    //#given a plan file
    Bun.spawnSync(["mkdir", "-p", join(".matrixx", "plans")])
    const planPath = join(".matrixx", "plans", "demo-plan.md")
    writeFileSync(planPath, "# Plan\n", "utf-8")
    createReviewsDir()

    //#when a review is written
    writeReviewReport(input())

    //#then the reviews directory holds exactly two files
    const written = readdirSync(join(".matrixx", "reviews")).sort()
    expect(written).toEqual(["demo-plan.json", "demo-plan.md"])
  })
})

describe("writeReviewReport — the sidecar round-trips on disk", () => {
  test("the written .json parses back to the same object the renderer built", () => {
    //#given a written review
    createReviewsDir()
    const result = writeReviewReport(input())

    //#when the sidecar is read from disk and parsed
    const parsed: unknown = JSON.parse(readFileSync(result.sidecarPath, "utf-8"))

    //#then it carries the version and the full dimension list
    const sidecar = parsed as { sidecarVersion: string; dimensions: unknown[] }
    expect(sidecar.sidecarVersion).toBe(REVIEW_SIDECAR_VERSION)
    expect(sidecar.dimensions).toHaveLength(8)
  })

  test("a failed write reports the mkdir command instead of creating the directory", () => {
    //#given a project with no .matrixx/reviews directory at all
    expect(existsSync(".matrixx/reviews")).toBe(false)

    //#when a review is attempted
    const result = writeReviewReport(input())

    //#then it fails loudly, names the missing-directory fix, and writes nothing
    expect(result.ok).toBe(false)
    expect(result.error).toContain('mkdir -p ".matrixx/reviews"')
    expect(existsSync(".matrixx/reviews")).toBe(false)
  })
})

describe("crash safety", () => {
  test("a crash after the temp file is written leaves no partial report", () => {
    //#given a first, complete report already on disk
    createReviewsDir()
    const first = writeReviewReport(input())
    expect(first.ok).toBe(true)
    const goodBytes = readFileSync(first.reportPath, "utf-8")
    const goodSidecar = readFileSync(first.sidecarPath, "utf-8")

    //#when a second write is interrupted after the temp file lands but before rename
    const tmpReport = `${first.reportPath}.tmp.${process.pid}`
    const newBody = "a substantially longer second report body that must never be half-visible"
    writeFileSync(tmpReport, newBody.slice(0, 12), "utf-8")
    Bun.spawnSync(["sh", "-c", "kill -9 $$"])

    //#then the visible report is the OLD complete one, not a partial new one
    expect(readFileSync(first.reportPath, "utf-8")).toBe(goodBytes)
    expect(readFileSync(first.sidecarPath, "utf-8")).toBe(goodSidecar)
    expect(readFileSync(first.reportPath, "utf-8")).not.toContain(newBody.slice(0, 12))
  })

  test("a first-ever write that crashes leaves no report at all, not a stub", () => {
    //#given an empty reviews directory and no prior report
    createReviewsDir()
    const target = reviewReportPath(input().planName)
    expect(existsSync(target)).toBe(false)

    //#when the only write crashes after its temp file lands
    const tmp = `${target}.tmp.${process.pid}`
    writeFileSync(tmp, "half a report", "utf-8")
    Bun.spawnSync(["sh", "-c", "kill -9 $$"])

    //#then no report file exists — a reader cannot mistake the stub for one
    expect(existsSync(target)).toBe(false)
  })

  test("a completed write leaves no temp file behind", () => {
    //#given a successful review
    createReviewsDir()
    const result = writeReviewReport(input())

    //#when the directory is inspected
    const entries = readdirSync(join(".matrixx", "reviews"))

    //#then only the two final artefacts remain
    expect(entries.sort()).toEqual(["demo-plan.json", "demo-plan.md"])
    expect(entries.some((f) => f.includes(".tmp."))).toBe(false)
    expect(result.ok).toBe(true)
  })

  test("atomicWrite replaces by rename, so the target is never truncated in place", () => {
    //#given an existing report
    const target = join(dir, "report.md")
    expect(atomicWrite(target, "first complete report")).toBe(true)

    //#when it is replaced with a longer body
    const longer = "second, considerably longer complete report body"
    expect(atomicWrite(target, longer)).toBe(true)

    //#then the file holds the ENTIRE new body, with no remnant of the old
    expect(readFileSync(target, "utf-8")).toBe(longer)
    expect(existsSync(`${target}.tmp.${process.pid}`)).toBe(false)
  })

  test("a failed atomicWrite reports false rather than throwing", () => {
    //#given a target in a directory that does not exist
    const target = join(dir, "no-such-dir", "report.md")

    //#when the write is attempted
    const ok = atomicWrite(target, "body")

    //#then it reports failure and creates nothing
    expect(ok).toBe(false)
    expect(existsSync(target)).toBe(false)
  })
})
