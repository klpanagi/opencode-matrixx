/// <reference types="bun-types" />
import { describe, test, expect } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildRehydrationContext,
  MAX_REHYDRATION_BYTES,
  MAX_TOTAL_COMPACTION_BYTES,
  measureCombinedCompactionBytes,
} from "../../../src/features/mission-state/rehydrate"
import { createCompactionContextInjector } from "../../../src/hooks/compaction-context-injector/hook"

function tmpDir(): string {
  const d = join(tmpdir(), `rehydrate-budget-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(d, { recursive: true })
  return d
}

function writeMission(dir: string, activePlan: string, planName = "budget-plan"): void {
  const missionDir = join(dir, ".matrixx")
  mkdirSync(missionDir, { recursive: true })
  writeFileSync(
    join(missionDir, "mission.json"),
    JSON.stringify({
      active_plan: activePlan,
      started_at: "2026-07-10T20:00:00.000Z",
      session_ids: ["ses_1"],
      plan_name: planName,
    }),
    "utf-8",
  )
}

function setupPlan(dir: string, name: string, content: string): string {
  const planPath = join(dir, ".matrixx", "plans", name)
  mkdirSync(join(planPath, ".."), { recursive: true })
  writeFileSync(planPath, content, "utf-8")
  writeMission(dir, planPath)
  return planPath
}

describe("rehydration byte budgets", () => {
  test("budget constants are hardcoded to expected values", () => {
    //#given
    // constants imported from rehydrate.ts
    //#when
    // (no action — assert static contract)
    //#then
    expect(MAX_REHYDRATION_BYTES).toBe(8000)
    expect(MAX_TOTAL_COMPACTION_BYTES).toBeGreaterThanOrEqual(MAX_REHYDRATION_BYTES)
  })

  test("small plan directive fits within budget", () => {
    //#given
    const dir = tmpDir()
    setupPlan(dir, "small.md", "- [ ] Task one\n- [x] Task two")

    //#when
    const ctx = buildRehydrationContext(dir)

    //#then
    expect(ctx).not.toBeNull()
    expect(Buffer.byteLength(ctx?.directive ?? "", "utf8")).toBeLessThanOrEqual(MAX_REHYDRATION_BYTES)
  })

  test("over-budget plan is truncated with marker and path preserved", () => {
    //#given
    const dir = tmpDir()
    // Multibyte fixture: each "é" is 2 bytes in UTF-8 so byteLength > string length.
    const bigBody = `${"é".repeat(6000)}\n- [ ] Big task one\n- [ ] Big task two\n`
    const planPath = setupPlan(dir, "big.md", bigBody)

    //#when
    const ctx = buildRehydrationContext(dir)

    //#then
    expect(ctx).not.toBeNull()
    const bytes = Buffer.byteLength(ctx?.directive ?? "", "utf8")
    expect(bytes).toBeLessThanOrEqual(MAX_REHYDRATION_BYTES)
    // Multibyte assertion: naive .length accounting would undercount.
    expect(Buffer.byteLength(bigBody, "utf8")).toBeGreaterThan(bigBody.length)
    expect(ctx?.directive).toContain(`[... truncated to ${MAX_REHYDRATION_BYTES} bytes`)
    expect(ctx?.directive).toContain(planPath)
    // Path + progress markers are never dropped.
    expect(ctx?.directive).toContain("Active Plan:")
    expect(ctx?.directive).toContain("tasks completed")
    expect(ctx?.planPath).toBe(planPath)
  })

  test("injector + rehydration combined stays within total budget", () => {
    //#given
    const dir = tmpDir()
    const bigBody = `x\n${"y".repeat(9000)}\n- [ ] Task one\n- [ ] Task two\n`
    setupPlan(dir, "combined.md", bigBody)
    const injector = createCompactionContextInjector()

    //#when
    const ctx = buildRehydrationContext(dir)
    const injectorPrompt = injector()
    const combined = measureCombinedCompactionBytes(injectorPrompt, ctx?.directive ?? "")

    //#then
    expect(ctx).not.toBeNull()
    expect(combined).toBeLessThanOrEqual(MAX_TOTAL_COMPACTION_BYTES)
  })

  test("null contract preserved across all four cases", () => {
    //#given
    const noMission = tmpDir()
    const emptyPlan = tmpDir()
    mkdirSync(join(emptyPlan, ".matrixx"), { recursive: true })
    writeFileSync(join(emptyPlan, ".matrixx", "mission.json"), JSON.stringify({ active_plan: "" }), "utf-8")
    const missing = tmpDir()
    writeMission(missing, "/nonexistent/plan.md")
    const doneDir = tmpDir()
    setupPlan(doneDir, "done.md", "- [x] Task one\n- [x] Task two")

    //#when
    const results = [
      buildRehydrationContext(noMission),
      buildRehydrationContext(emptyPlan),
      buildRehydrationContext(missing),
      buildRehydrationContext(doneDir),
    ]

    //#then
    for (const r of results) expect(r).toBeNull()
  })
})
