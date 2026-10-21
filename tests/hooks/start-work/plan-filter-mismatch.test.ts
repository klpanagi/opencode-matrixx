import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { serializePlanFrontMatter } from "../../../src/features/plan-contract"
import { formatPlanListLine } from "../../../src/hooks/start-work/plan-filter"

describe("plan-filter mismatch banner tag (Task 6)", () => {
  let testDir: string
  let plansDir: string

  function writePlan(name: string, content: string): string {
    const planPath = join(plansDir, name)
    writeFileSync(planPath, content)
    return planPath
  }

  beforeEach(() => {
    testDir = join(tmpdir(), `plan-filter-mismatch-${randomUUID()}`)
    plansDir = join(testDir, ".matrixx", "plans")
    mkdirSync(plansDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("mismatched plan line carries the mismatch tag", async () => {
    //#given a plan whose status disagrees with its checkboxes
    const body = ["# Mismatch", "", "- [ ] 1. unfinished work", ""].join("\n")
    const mismatched = writePlan(
      "mismatch-plan.md",
      `${serializePlanFrontMatter({ status: "completed", revision: 1 })}${body}`,
    )

    //#when the banner line is rendered with no explicit tag
    const line = formatPlanListLine(mismatched, 0)

    //#then the mismatch tag is present alongside progress
    expect(line).toContain("[mismatch-plan]")
    expect(line).toContain("[mismatch]")
  })

  test("matching plan line carries no mismatch tag", async () => {
    //#given a plan whose status agrees with its checkboxes
    const body = ["# Matching", "", "- [ ] 1. unfinished work", ""].join("\n")
    const matching = writePlan(
      "matching-plan.md",
      `${serializePlanFrontMatter({ status: "pending", revision: 1 })}${body}`,
    )

    //#when the banner line is rendered
    const line = formatPlanListLine(matching, 0)

    //#then no mismatch tag appears
    expect(line).not.toContain("[mismatch]")
  })
})
