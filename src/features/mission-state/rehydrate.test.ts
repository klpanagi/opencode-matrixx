/**
 * Tests for plan-persistence rehydration.
 */
import { describe, expect, it } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildRehydrationContext, findActivePlan } from "./rehydrate"

function tmpDir(): string {
  const d = join(tmpdir(), `plan-rehydrate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(d, { recursive: true })
  return d
}

function writeMission(dir: string, activePlan: string, planName?: string) {
  const missionDir = join(dir, ".matrixx")
  mkdirSync(missionDir, { recursive: true })
  writeFileSync(
    join(missionDir, "mission.json"),
    JSON.stringify({
      active_plan: activePlan,
      started_at: "2026-07-10T20:00:00.000Z",
      session_ids: ["ses_1"],
      plan_name: planName ?? "test-plan",
    }),
    "utf-8",
  )
}

function writePlan(planPath: string, content: string) {
  mkdirSync(join(planPath, ".."), { recursive: true })
  writeFileSync(planPath, content, "utf-8")
}

describe("findActivePlan", () => {
  it("returns null when no mission file exists", () => {
    const dir = tmpDir()
    expect(findActivePlan(dir)).toBeNull()
  })

  it("returns the plan path when mission has active_plan", () => {
    const dir = tmpDir()
    const planPath = join(dir, ".matrixx", "plans", "test.md")
    writePlan(planPath, "- [ ] Task")
    writeMission(dir, planPath)
    expect(findActivePlan(dir)).toBe(planPath)
  })
})

describe("buildRehydrationContext", () => {
  it("returns null when no mission file", () => {
    const dir = tmpDir()
    expect(buildRehydrationContext(dir)).toBeNull()
  })

  it("returns null when mission has no active_plan", () => {
    const dir = tmpDir()
    const missionDir = join(dir, ".matrixx")
    mkdirSync(missionDir, { recursive: true })
    writeFileSync(
      join(missionDir, "mission.json"),
      JSON.stringify({ active_plan: "" }),
      "utf-8",
    )
    expect(buildRehydrationContext(dir)).toBeNull()
  })

  it("returns null when plan file is missing", () => {
    const dir = tmpDir()
    writeMission(dir, "/nonexistent/plan.md")
    expect(buildRehydrationContext(dir)).toBeNull()
  })

  it("returns context with plan content and progress", () => {
    const dir = tmpDir()
    const planPath = join(dir, ".matrixx", "plans", "test.md")
    writePlan(planPath, "- [ ] Task one\n- [x] Task two")
    writeMission(dir, planPath, "test-plan")

    const ctx = buildRehydrationContext(dir)
    expect(ctx).not.toBeNull()
    expect(ctx?.planName).toBe("test-plan")
    expect(ctx?.progress.total).toBe(2)
    expect(ctx?.progress.completed).toBe(1)
    expect(ctx?.directive).toContain("Active Plan: test-plan")
    expect(ctx?.directive).toContain("1/2 tasks completed")
    expect(ctx?.content).toContain("Task one")
    expect(ctx?.content).toContain("Task two")
  })

  it("returns null when plan is 100% complete", () => {
    const dir = tmpDir()
    const planPath = join(dir, ".matrixx", "plans", "done.md")
    writePlan(planPath, "- [x] Task one\n- [x] Task two")
    writeMission(dir, planPath, "done-plan")
    expect(buildRehydrationContext(dir)).toBeNull()
  })

  it("includes metadata comment info when present", () => {
    const dir = tmpDir()
    const planPath = join(dir, ".matrixx", "plans", "meta.md")
    const planContent = [
      "- [ ] Task one",
      "",
      '<!-- plan-persister: {"id":"meta","updatedAt":"2026-07-10T21:00:00.000Z","sessionId":"ses_abc","todoTotal":3,"todoCompleted":1} -->',
    ].join("\n")
    writePlan(planPath, planContent)
    writeMission(dir, planPath, "meta-plan")

    const ctx = buildRehydrationContext(dir)
    expect(ctx).not.toBeNull()
    expect(ctx?.directive).toContain("ses_abc")
    expect(ctx?.directive).toContain("2026-07-10T21:00:00.000Z")
  })
})
