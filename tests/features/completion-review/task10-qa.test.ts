/// <reference types="bun-types" />
import { beforeAll, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { createHash } from "node:crypto"

import { evaluateAdmission } from "../../../src/features/completion-review/admission-gate"
import { buildReviewDirCommand } from "../../../src/features/completion-review/report-write"
import { gatherCompletionReviewInputs } from "../../../src/features/completion-review/gather"
import { detectMissingModelSections } from "../../../src/features/completion-review/degradation-model"
import { PLAN_FILENAME_KEBAB_REGEX } from "../../../src/tools/plan/constants"
import { buildSectionIndex } from "../../../src/tools/plan/section-index"

const REPO_ROOT = resolve(import.meta.dir, "../../..")
const WORK = join(REPO_ROOT, ".matrixx/smoke/task-10")

/**
 * The write runs in a subprocess whose cwd is the fixture project, because
 * `writeReviewReport` resolves `.matrixx/reviews` relative to the process cwd —
 * that is the working directory the agent's bash session has.
 */
const WRITE_DRIVER = `
import { writeReviewReport } from ${JSON.stringify(join(REPO_ROOT, "src/features/completion-review/report-write.ts"))}
import { gatherCompletionReviewInputs } from ${JSON.stringify(join(REPO_ROOT, "src/features/completion-review/gather.ts"))}
const g = gatherCompletionReviewInputs({ directory: process.cwd(), planPath: process.argv[2] })
const w = writeReviewReport({
  planPath: g.planPath, planName: g.planName,
  generatedAt: "2026-09-29T00:00:00.000Z", coverageClass: "post-capture",
  progress: g.progress, admission: g.admission, attribution: g.attribution,
  provenance: { gather: g.provenance, evidence: [] },
  score: { value: 0, grade: 0, scoredWeight: 0, dimensionCount: 8 },
  dimensions: [],
  complexity: { planned: null, observed: null, comparison: null, note: "" },
  effort: { planned: null, observed: null, comparison: null, note: "" },
  findings: [],
})
console.log(JSON.stringify({ ok: w.ok, reportPath: w.reportPath, sidecarPath: w.sidecarPath, markdown: w.markdown, error: w.error }))
`

interface WriteResult {
  ok: boolean
  reportPath: string
  sidecarPath: string
  markdown: string
  error: string | null
}

function runWrite(planPath: string): WriteResult {
  const out = spawnSync("bun", ["-e", WRITE_DRIVER, planPath], { cwd: WORK, encoding: "utf8" })
  if (out.status !== 0) throw new Error(out.stderr)
  return JSON.parse(out.stdout.trim()) as WriteResult
}

function md5(path: string): string {
  return createHash("md5").update(readFileSync(path)).digest("hex")
}

function fixture(name: string, checked: number, total: number): string {
  const plans = join(WORK, ".matrixx/plans")
  mkdirSync(plans, { recursive: true })
  const tasks = Array.from({ length: total }, (_, i) => {
    const box = i < checked ? "x" : " "
    return `- [${box}] ${i + 1}. Task ${i + 1} — do the thing`
  }).join("\n")
  const dod = ["- [ ] DoD line 1", "- [ ] DoD line 2", "- [ ] DoD line 3", "- [ ] DoD line 4"].join("\n")
  const body = [
    `# ${name}`,
    "",
    "## Work Objectives",
    "Ship the thing.",
    "",
    "## Must NOT Have (Guardrails)",
    "No rewrites of shipped modules.",
    "",
    "## Test Decision",
    "### Test Decision H3",
    "Tests are required for this plan.",
    "",
    "## Todos",
    tasks,
    "",
    "## Definition of Done",
    dod,
    "",
  ].join("\n")
  const path = join(plans, `${name}.md`)
  writeFileSync(path, body)
  return path
}

beforeAll(() => {
  rmSync(WORK, { recursive: true, force: true })
  mkdirSync(join(WORK, ".matrixx/plans"), { recursive: true })
  const mkdir = spawnSync("sh", ["-c", buildReviewDirCommand()], { cwd: WORK, encoding: "utf8" })
  expect(mkdir.status).toBe(0)
  expect(existsSync(join(WORK, ".matrixx/reviews"))).toBe(true)
})

test("Scenario 1 — explicit review of a finished plan produces all four parts + sidecar", () => {
  //#given a completed fixture plan with 4 DoD lines, 3 tasks and a Test Decision H3
  const planPath = fixture("qa-completed-fixture", 3, 3)
  const before = md5(planPath)
  const gathered = gatherCompletionReviewInputs({ directory: WORK, planPath })
  const missingModelSections = detectMissingModelSections(buildSectionIndex(readFileSync(planPath, "utf-8")))
  const decision = evaluateAdmission({ progress: gathered.progress, admission: gathered.admission })

  //#when the report is written
  const written = runWrite(planPath)

  //#then the file exists, carries all four parts, has a sidecar, and the plan is untouched
  expect(written.ok).toBe(true)
  expect(existsSync(join(WORK, written.reportPath))).toBe(true)
  expect(existsSync(join(WORK, written.sidecarPath))).toBe(true)
  for (const part of ["## Summary", "## Score", "## Complexity", "## Required Effort"]) {
    expect(written.markdown).toContain(part)
  }
  expect(md5(planPath)).toBe(before)
  expect(decision.outcome).toBe("admitted")
  expect(decision.gateState).toBe("unavailable")
  expect(decision.gateEvidence).toBe("unavailable")
  expect(decision.gateDisagreement).toBeNull()
  expect(missingModelSections).toEqual([])
})

test("Scenario 2 — review of an in-progress plan writes NO report file", () => {
  //#given a plan with 5 tasks, 2 completed
  const planPath = fixture("qa-in-progress-fixture", 2, 5)
  const gathered = gatherCompletionReviewInputs({ directory: WORK, planPath })

  //#when the gate is evaluated
  const decision = evaluateAdmission({ progress: gathered.progress, admission: gathered.admission })

  //#then it refuses as not-yet-scorable, and no report file was ever produced
  expect(decision.outcome).toBe("refused")
  expect(decision.refuseCause).toBe("execution_incomplete")
  expect(decision.reason).toMatch(/not complete/i)
  expect(existsSync(join(WORK, ".matrixx/reviews/qa-in-progress-fixture.md"))).toBe(false)
  expect(existsSync(join(WORK, ".matrixx/reviews/qa-in-progress-fixture.json"))).toBe(false)
})

test("Scenario 3 — a non-kebab plan name is silently skipped, so resolution is empty", () => {
  //#given a plan file whose name plan_list's kebab regex rejects
  const plans = join(WORK, ".matrixx/plans")
  writeFileSync(join(plans, "Not Kebab Name.md"), "# Not Kebab Name\n\n## Todos\n\n- [x] 1. A\n")

  //#when the shared filter plan_list uses is applied
  const listed = PLAN_FILENAME_KEBAB_REGEX.test("Not Kebab Name.md")

  //#then it is silently skipped, and no report file is produced for it
  expect(listed).toBe(false)
  expect(existsSync(join(WORK, ".matrixx/reviews/Not Kebab Name.md"))).toBe(false)
})
