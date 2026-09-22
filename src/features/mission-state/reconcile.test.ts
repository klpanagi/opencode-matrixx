import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PLANS_ARCHIVE_DIR_NAME } from "./constants"
import {
  archiveStalePlans,
  isHighConfidence,
  readActiveTaskSubjects,
  reconcilePlanContent,
  reconcilePlanFile,
  shouldReconcileOnStartWork,
} from "./reconcile"
import { findOraclePlans } from "./storage"

let projectDir = ""
let plansDir = ""

function makeProject(): void {
  //#given a fresh fixture project
  projectDir = mkdtempSync(join(tmpdir(), "reconcile-"))
  plansDir = join(projectDir, ".matrixx", "plans")
  mkdirSync(plansDir, { recursive: true })
}

function writePlan(name: string, content: string, mtimeMs?: number): string {
  const planPath = join(plansDir, name)
  writeFileSync(planPath, content, "utf-8")
  if (mtimeMs !== undefined) utimesSync(planPath, new Date(mtimeMs), new Date(mtimeMs))
  return planPath
}

beforeEach(makeProject)

afterEach(() => {
  if (projectDir && existsSync(projectDir)) rmSync(projectDir, { recursive: true, force: true })
  projectDir = ""
})

describe("isHighConfidence gate", () => {
  test("matched overlap is high-confidence", () => {
    //#given a box overlapping a completed task
    const box = "Implement task alpha"
    const todo = "Implement task alpha"

    //#when checking the gate
    const result = isHighConfidence(box, todo)

    //#then it passes
    expect(result).toBe(true)
  })

  test("unmatched box is low-confidence", () => {
    //#given a box with no overlapping task
    const box = "Refactor widget factory"
    const todo = "Something unrelated entirely"

    //#when checking the gate
    const result = isHighConfidence(box, todo)

    //#then it fails
    expect(result).toBe(false)
  })

  test("verification-flagged box never passes even with matching text", () => {
    //#given a verification box recorded in the flagged list
    const box = "Verify release checklist"
    const flagged = ["Verify release checklist"]

    //#when checking the gate with the flag set
    const result = isHighConfidence(box, box, flagged)

    //#then it fails — never auto-complete flagged verification
    expect(result).toBe(false)
  })
})

describe("reconcilePlanContent", () => {
  test("checks high-overlap box, keeps verification box flagged", () => {
    //#given a plan with one matchable box and one verification box
    const content = "- [ ] Implement task alpha\n- [ ] Verify release checklist"
    const todos = [{ content: "Implement task alpha", status: "completed" }]

    //#when reconciling
    const result = reconcilePlanContent(content, todos)

    //#then only the high-confidence box flips, verification is flagged
    expect(result.content).toContain("- [x] Implement task alpha")
    expect(result.content).toContain("- [ ] Verify release checklist")
    expect(result.checked).toEqual(["Implement task alpha"])
    expect(result.flaggedVerification).toEqual(["Verify release checklist"])
    expect(result.changed).toBe(true)
  })

  test("low-confidence box stays unchecked and is reported", () => {
    //#given a box with no overlapping task
    const content = "- [ ] Refactor widget factory"
    const todos = [{ content: "Something unrelated entirely", status: "completed" }]

    //#when reconciling
    const result = reconcilePlanContent(content, todos)

    //#then the box stays honest-incomplete and is reported
    expect(result.content).toBe("- [ ] Refactor widget factory")
    expect(result.lowConfidence).toEqual(["Refactor widget factory"])
    expect(result.flaggedVerification).toEqual([])
    expect(result.changed).toBe(false)
  })
})

describe("reconcilePlanFile idempotency", () => {
  test("second run over converged plan produces zero writes", () => {
    //#given a plan file with one matchable box
    const planPath = writePlan("work.md", "- [ ] Implement task alpha\n- [ ] Refactor widget factory")
    const todos = [{ content: "Implement task alpha", status: "completed" }]

    //#when reconciling twice
    const first = reconcilePlanFile(planPath, todos)
    const second = reconcilePlanFile(planPath, todos)

    //#then the first run writes, the second is a no-op
    expect(first.wrote).toBe(true)
    expect(first.checked).toEqual(["Implement task alpha"])
    expect(second.wrote).toBe(false)
    expect(second.changed).toBe(false)
    expect(second.checked).toEqual([])
  })
})

describe("shouldReconcileOnStartWork invocation point", () => {
  test("triggers only when more than one incomplete plan exists", () => {
    //#given incomplete-plan counts
    //#when evaluating the trigger
    //#then >1 reconciles, 0-1 does not
    expect(shouldReconcileOnStartWork(2)).toBe(true)
    expect(shouldReconcileOnStartWork(1)).toBe(false)
    expect(shouldReconcileOnStartWork(0)).toBe(false)
  })
})

describe("archiveStalePlans", () => {
  const STALE_MS = Date.now() - 30 * 24 * 3_600_000

  test("moves stale orphan to _archive/ preserving meta, excluded from listings", () => {
    //#given a stale orphan with persister meta and a fresh plan
    const orphan = writePlan(
      "orphan.md",
      "- [ ] Refactor widget factory\n\n<!-- plan-persister: {\"id\":\"orphan\"} -->\n",
      STALE_MS,
    )
    writePlan("fresh.md", "- [ ] Implement task alpha")
    expect(findOraclePlans(projectDir)).toHaveLength(2)

    //#when applying archival
    const result = archiveStalePlans(projectDir, { activeTaskSubjects: [] })

    //#then the orphan moves with meta intact and vanishes from listings
    expect(result.candidates).toEqual([orphan])
    expect(result.moved).toHaveLength(1)
    expect(result.before).toBe(2)
    expect(result.after).toBe(1)
    const dest = join(plansDir, PLANS_ARCHIVE_DIR_NAME, "orphan.md")
    expect(existsSync(dest)).toBe(true)
    expect(existsSync(orphan)).toBe(false)
    expect(readFileSync(dest, "utf-8")).toContain("<!-- plan-persister:")
    expect(findOraclePlans(projectDir).some((p) => p.includes(PLANS_ARCHIVE_DIR_NAME))).toBe(false)
  })

  test("dry-run reports candidates but moves nothing", () => {
    //#given a stale orphan
    const orphan = writePlan("orphan.md", "- [ ] Refactor widget factory", STALE_MS)

    //#when dry-running
    const result = archiveStalePlans(projectDir, { activeTaskSubjects: [], dryRun: true })

    //#then the candidate is reported, nothing moves
    expect(result.candidates).toEqual([orphan])
    expect(result.moved).toEqual([])
    expect(existsSync(orphan)).toBe(true)
    expect(existsSync(join(plansDir, PLANS_ARCHIVE_DIR_NAME, "orphan.md"))).toBe(false)
  })

  test("active plan is never archived", () => {
    //#given a stale plan referenced as the mission active plan
    const active = writePlan("active.md", "- [ ] Refactor widget factory", STALE_MS)

    //#when scanning with the active-plan reference
    const result = archiveStalePlans(projectDir, { activeTaskSubjects: [], activePlan: active })

    //#then it is not a candidate
    expect(result.candidates).toEqual([])
    expect(result.moved).toEqual([])
    expect(existsSync(active)).toBe(true)
  })

  test("plan linked to an active task is never archived", () => {
    //#given a stale plan overlapping an active task subject
    const linked = writePlan("linked.md", "- [ ] Implement task alpha", STALE_MS)

    //#when scanning with the linked active subject
    const result = archiveStalePlans(projectDir, { activeTaskSubjects: ["Implement task alpha"] })

    //#then it is not a candidate
    expect(result.candidates).toEqual([])
    expect(existsSync(linked)).toBe(true)
  })
})

describe("readActiveTaskSubjects strict-schema handling", () => {
  test("schema-drop files are reported unknown, never treated as subjects", () => {
    //#given one valid active task and one corrupt task file
    const tasksDir = join(projectDir, ".matrixx", "tasks")
    mkdirSync(tasksDir, { recursive: true })
    writeFileSync(
      join(tasksDir, "T-valid.json"),
      JSON.stringify({ id: "T-valid", subject: "Implement task alpha", description: "", status: "pending", blocks: [], blockedBy: [] }),
      "utf-8",
    )
    writeFileSync(join(tasksDir, "T-bad.json"), "{not valid json", "utf-8")

    //#when reading active subjects
    const result = readActiveTaskSubjects(projectDir, {})

    //#then only the valid subject surfaces, the corrupt file is unknown
    expect(result.subjects).toEqual(["Implement task alpha"])
    expect(result.unknownTaskFiles).toEqual(["T-bad"])
  })
})
