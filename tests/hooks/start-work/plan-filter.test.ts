import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import {
  ARCHIVED_PLAN_SEGMENT,
  classifyPlans,
  formatPlanAge,
  formatPlanListLine,
  getPlanAgeMs,
  getPlansStaleAfterMs,
  isArchivedPlan,
  isPlanStale,
} from "../../../src/hooks/start-work/plan-filter"

describe("plan-filter", () => {
  let testDir: string
  let plansDir: string
  const STALE_AFTER_MS = 24 * 60 * 60 * 1000

  function writePlan(name: string, content: string, mtimeMs?: number): string {
    const planPath = join(plansDir, name)
    writeFileSync(planPath, content)
    if (mtimeMs !== undefined) {
      const atime = new Date(mtimeMs)
      utimesSync(planPath, atime, atime)
    }
    return planPath
  }

  beforeEach(() => {
    testDir = join(tmpdir(), `plan-filter-test-${randomUUID()}`)
    plansDir = join(testDir, ".matrixx", "plans")
    mkdirSync(plansDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe("classifyPlans", () => {
    test("surfaces only the fresh incomplete plan as actionable", async () => {
      //#given - one fresh incomplete, one stale orphan, one complete, one empty
      const fresh = writePlan("fresh-incomplete.md", "# Fresh\n- [ ] 1. Do work\n- [x] 2. Done setup")
      const staleMtime = Date.now() - 48 * 60 * 60 * 1000
      const stale = writePlan("stale-orphan.md", "# Stale\n- [ ] 1. Old work", staleMtime)
      const complete = writePlan("done.md", "# Done\n- [x] 1. Finished")
      const empty = writePlan("empty.md", "# Empty\nJust prose, no checkboxes.")

      //#when
      const result = classifyPlans([fresh, stale, complete, empty], { staleAfterMs: STALE_AFTER_MS })

      //#then - only the fresh incomplete plan is actionable
      expect(result.actionable).toEqual([fresh])
      expect(result.staleCandidates).toEqual([stale])
      expect(result.completed).toEqual([complete])
      expect(result.triage).toEqual([empty])
    })

    test("excludes archived plans from every bucket", async () => {
      //#given - an incomplete plan inside the archive dir
      const archiveDir = join(plansDir, ARCHIVED_PLAN_SEGMENT)
      mkdirSync(archiveDir, { recursive: true })
      const archived = join(archiveDir, "old-plan.md")
      writeFileSync(archived, "# Old\n- [ ] 1. Archived work")
      const fresh = writePlan("fresh.md", "# Fresh\n- [ ] 1. Work")

      //#when
      const result = classifyPlans([archived, fresh], { staleAfterMs: STALE_AFTER_MS })

      //#then - archived plan appears nowhere
      expect(result.actionable).toEqual([fresh])
      expect(result.staleCandidates).toEqual([])
      expect(result.triage).toEqual([])
      expect(result.completed).toEqual([])
    })

    test("keeps stale plan actionable when linked active tasks exist", async () => {
      //#given - a stale-mtime plan that still has linked active tasks
      const staleMtime = Date.now() - 72 * 60 * 60 * 1000
      const linked = writePlan("linked.md", "# Linked\n- [ ] 1. Active work", staleMtime)

      //#when
      const result = classifyPlans([linked], {
        staleAfterMs: STALE_AFTER_MS,
        hasLinkedActiveTasks: (p) => p === linked,
      })

      //#then - linkage wins over mtime staleness
      expect(result.actionable).toEqual([linked])
      expect(result.staleCandidates).toEqual([])
    })

    test("treats unreadable plan age as fresh, never stale", async () => {
      //#given - a plan path whose mtime cannot be stat'ed but has checkboxes on disk
      const missing = join(plansDir, "ghost.md")

      //#when
      const stale = isPlanStale(missing, STALE_AFTER_MS)

      //#then
      expect(stale).toBe(false)
      expect(getPlanAgeMs(missing)).toBeNull()
    })
  })

  describe("isArchivedPlan", () => {
    test("detects _archive segment in plan path", async () => {
      //#given
      const archived = join(plansDir, "_archive", "old.md")
      const normal = join(plansDir, "current.md")

      //#when / #then
      expect(isArchivedPlan(archived)).toBe(true)
      expect(isArchivedPlan(normal)).toBe(false)
    })
  })

  describe("getPlansStaleAfterMs", () => {
    test("defaults to 24h when no config provided", async () => {
      //#given - no config
      //#when
      const ms = getPlansStaleAfterMs(undefined)

      //#then
      expect(ms).toBe(24 * 60 * 60 * 1000)
    })

    test("honours tasks.stale_after_hours override", async () => {
      //#given - config with 2h staleness
      //#when
      const ms = getPlansStaleAfterMs({ tasks: { enabled: true, stale_after_hours: 2 } })

      //#then
      expect(ms).toBe(2 * 60 * 60 * 1000)
    })
  })

  describe("formatPlanAge", () => {
    test("formats hours and days", async () => {
      //#given / #when / #then
      expect(formatPlanAge(3 * 60 * 60 * 1000)).toBe("3h")
      expect(formatPlanAge(49 * 60 * 60 * 1000)).toBe("2d")
      expect(formatPlanAge(-5000)).toBe("0h")
    })
  })

  describe("formatPlanListLine", () => {
    test("includes progress, age, and tag", async () => {
      //#given - a fresh incomplete plan
      const fresh = writePlan("tagged.md", "# Tagged\n- [ ] 1. Work\n- [x] 2. Setup")

      //#when
      const line = formatPlanListLine(fresh, 0, "stale")

      //#then
      expect(line).toContain("[tagged]")
      expect(line).toContain("1/2")
      expect(line).toContain("ago")
      expect(line).toContain("[stale]")
    })
  })
})
