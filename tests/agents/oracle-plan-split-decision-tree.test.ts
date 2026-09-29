/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { ORACLE_IDENTITY_CONSTRAINTS } from "../../src/agents/oracle/identity-constraints"

/**
 * The split-decision-tree region is everything between the 6.1 heading and the
 * next numbered section. Scoping the assertions to a region (rather than the
 * whole prompt) is what makes the structural invariant load-bearing: the rest of
 * the prompt legitimately mentions plan_create/plan_update many times.
 */
function splitRegion(): string {
  const start = ORACLE_IDENTITY_CONSTRAINTS.indexOf("### 6.1 ")
  const end = ORACLE_IDENTITY_CONSTRAINTS.indexOf("### 7. ", start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return ORACLE_IDENTITY_CONSTRAINTS.slice(start, end)
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

function blocksWithCutover(region: string): string {
  const block =
    (region.match(/```[\s\S]*?```/g) ?? []).find((candidate) => candidate.includes("-cutover.md")) ?? ""
  expect(block).not.toBe("")
  return block
}

describe("Oracle plan split decision tree — exactly one tree", () => {
  test("the split region contains exactly ONE decision-tree heading", () => {
    //#given
    const region = splitRegion()

    //#when
    const treeHeadings = countOccurrences(region, "## DECISION TREE")

    //#then — a second tree heading means two competing split idioms again
    expect(treeHeadings).toBe(1)
  })

  test("each of the three branches is declared exactly once", () => {
    //#given
    const region = splitRegion()

    //#when
    const branch1 = countOccurrences(region, "Branch 1 —")
    const branch2 = countOccurrences(region, "Branch 2 —")
    const branch3 = countOccurrences(region, "Branch 3 —")

    //#then — a duplicated branch label is the re-introduced-second-rule regression
    expect(branch1).toBe(1)
    expect(branch2).toBe(1)
    expect(branch3).toBe(1)
  })

  test("the tree covers all three cases: atomic, three-phase append, cutover companion", () => {
    //#given
    const region = splitRegion()

    //#when / #then
    expect(region).toContain("single atomic create")
    expect(region).toContain("three-phase append")
    expect(region).toContain("cutover companion")
  })
})

describe("Oracle plan split decision tree — pre-existing rules preserved", () => {
  test("both original rules survive the reconciliation", () => {
    //#given
    const region = splitRegion()

    //#when / #then
    expect(region).toContain("Create ONCE with plan_create")
    expect(region).toContain("NEVER split into multiple plan_create calls")
  })

  test("the sanctioned three-phase path is a legitimate branch, not a prohibition", () => {
    //#given
    const region = splitRegion()

    //#when / #then
    expect(region).toMatch(/Branch 2 — three-phase append[\s\S]{0,400}?OK/)
  })

  test("the cutover branch states it is a NEW file via plan_create", () => {
    //#given
    const region = splitRegion()

    //#when
    const branch3 = region.slice(region.indexOf("Branch 3 —"))

    //#then — this is what makes system-prompt.ts:21 (plans modified ONLY via
    // plan_update) satisfiable by a companion file
    expect(branch3).toMatch(/new file via `plan_create`/i)
    expect(branch3).toMatch(/not a modification/i)
  })

  test("the cutover branch names the live skill-native-handover precedent", () => {
    //#given
    const region = splitRegion()

    //#when / #then
    expect(region).toContain("skill-native-handover-cutover.md")
  })
})

describe("Oracle plan split decision tree — matches enforced behaviour", () => {
  test("the tree never promises a second plan_create on the same path", () => {
    //#given
    const region = splitRegion()

    //#when
    // Scope is per-example-block on purpose: the same path legitimately recurs
    // across blocks (alternatives), but never twice within one (file_exists).
    // Only ✅ blocks are checked — a ❌ block exists precisely to show the
    // illegal sequence, so it is exempt by construction.
    const sanctioned = (region.match(/```[\s\S]*?```/g) ?? []).filter((block) => !block.includes("❌"))
    const offenders = sanctioned.filter((block) => {
      const paths = block.match(/plan_create\("([^"]+)"/g) ?? []
      return new Set(paths).size !== paths.length
    })

    //#then
    expect(region).toMatch(/NEVER split into multiple plan_create calls/)
    expect(offenders).toEqual([])
  })

  test("the cutover companion example creates two DISTINCT paths", () => {
    //#given
    const region = splitRegion()

    //#when
    const cutover = blocksWithCutover(region)

    //#then — this is the only sanctioned way to plan_create twice
    const paths = cutover.match(/plan_create\("([^"]+)"/g) ?? []
    expect(paths).toHaveLength(2)
    expect(new Set(paths).size).toBe(2)
  })

  test("generic Write/Edit on plan files stays forbidden", () => {
    //#given
    const region = splitRegion()

    //#when / #then
    expect(region).toContain("Generic Write/Edit on .matrixx/plans is BLOCKED")
  })

  test("the cap is referenced as a ceiling bypassed by span reads, not by a number", () => {
    //#given
    const region = splitRegion()

    //#when
    const lower = region.toLowerCase()

    //#then
    expect(lower).toContain("the cap")
    expect(region).not.toMatch(/102,400|102_400/)
  })

  test("plan review is explicit only — never automatic", () => {
    //#given
    const whole = ORACLE_IDENTITY_CONSTRAINTS

    //#when
    const automaticReview = /automatic.*review|on completion.*review|idle.*review/i

    //#then — LOCKED DECISION #3
    expect(whole).not.toMatch(automaticReview)
  })
})

describe("Oracle plan split decision tree — decision examples", () => {
  test("the ✅/✅/❌ examples cover all three branches", () => {
    //#given
    const region = splitRegion()

    //#when
    const okMarks = countOccurrences(region, "✅")
    const noMarks = countOccurrences(region, "❌")

    //#then — three sanctioned paths and the forbidden ones stay distinct
    expect(okMarks).toBeGreaterThanOrEqual(3)
    expect(noMarks).toBeGreaterThanOrEqual(3)
  })

  test("the self-check gains a cutover case alongside the first-creation case", () => {
    //#given
    const region = splitRegion()

    //#when / #then
    expect(region).toContain("Is this the FIRST creation of this file?")
    expect(region).toContain("File already exists with my content?")
    expect(region.toLowerCase()).toContain("split across two files?")
  })
})
