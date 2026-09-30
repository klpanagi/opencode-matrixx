/// <reference types="bun-types" />
/**
 * Task 7 — Complexity and Required Effort as CALIBRATION COMPARISONS.
 *
 * Every test here is behavioural: it asserts on a rendered string or a returned
 * value, never on an import existing. The RED phase therefore fails with an
 * assertion or a call to `undefined`, which is a real signal, rather than
 * `Cannot find module`.
 */
import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { checkCalibrationBaseline } from "../../../src/features/completion-review/calibration-baseline-check"
import { parsePlanTimeBaseline } from "../../../src/features/completion-review/calibration-baseline"
import { collectObservedExecutionFacts } from "../../../src/features/completion-review/calibration-observed"
import { renderCalibrationComparison } from "../../../src/features/completion-review/calibration-render"
import type { DriftFacts, ProgressFacts } from "../../../src/features/completion-review/gather-types"

const NO_BASELINE = "no baseline recorded"

function progress(completed: number, total: number): ProgressFacts {
  return { total, completed, remaining: total - completed, isComplete: completed === total }
}

function drift(files: number): DriftFacts {
  return {
    startCommit: "abc123",
    stat: null,
    nameStatus: Array.from({ length: files }, (_, i) => ({ status: "M", path: `src/file-${i}.ts` })),
    unscorable: false,
    unscorableReason: null,
  }
}

const ENUM_PLAN = `> **Quick Summary**: ship the thing
> **Estimated Effort**: Large
`

const PROSE_PLAN = `> **Estimated Effort**: Medium (≈1–2 agent-days of wall-clock, gated by 24 headless runs)
`

const MULTI_FIELD_PLAN = `**Estimated Effort**: Large · **Parallel**: YES — 3 waves · **Critical path**: T1 → T3
`

/** Any percentage, ratio, or "by N" phrasing would be a fabricated delta. */
const ARITHMETIC_PATTERNS = [/%\s*$/, /by \d/, /under-?estimat/i, /over-?estimat/i, /\d+\s*->\s*\d+/]

function expectNoArithmeticDelta(line: string): void {
  for (const pattern of ARITHMETIC_PATTERNS) {
    expect(line).not.toMatch(pattern)
  }
}

describe("parsePlanTimeBaseline", () => {
  test("parses the skeleton Estimated Effort line as the primary baseline", () => {
    //#given a plan carrying the line the skeleton emits
    const plan = ENUM_PLAN

    //#when the plan-time baseline is read
    const baseline = parsePlanTimeBaseline(plan)

    //#then the effort baseline is the verbatim word, not a number derived from it
    expect(baseline.effort).not.toBeNull()
    expect(baseline.effort?.verbatim).toBe("Large")
    expect(baseline.effort?.source).toBe("ESTIMATED_EFFORT_LINE")
  })

  test("preserves a free-form prose baseline verbatim", () => {
    //#given a corpus-style prose baseline
    const plan = PROSE_PLAN

    //#when the baseline is read
    const baseline = parsePlanTimeBaseline(plan)

    //#then nothing is trimmed, coerced or truncated
    expect(baseline.effort?.verbatim).toBe("Medium (≈1–2 agent-days of wall-clock, gated by 24 headless runs)")
  })

  test("takes only the tier when the line carries sibling fields", () => {
    //#given a single line holding the effort plus two sibling fields
    const plan = MULTI_FIELD_PLAN

    //#when the baseline is read
    const baseline = parsePlanTimeBaseline(plan)

    //#then the tier is the part before the first sibling separator
    expect(baseline.effort?.verbatim).toBe("Large")
  })

  test("reads a Complexity line when one exists", () => {
    //#given a plan that recorded a C-level at plan time
    const plan = "**Complexity**: 4\n**Estimated Effort**: Large\n"

    //#when the baseline is read
    const baseline = parsePlanTimeBaseline(plan)

    //#then the stored level is reproduced verbatim
    expect(baseline.complexity?.verbatim).toBe("4")
    expect(baseline.complexity?.source).toBe("COMPLEXITY_LINE")
  })

  test("leaves both fields null when the plan stores neither", () => {
    //#given a plan with no estimate line of any kind
    const plan = "# Title\n\n- [ ] 1. do the thing\n"

    //#when the baseline is read
    const baseline = parsePlanTimeBaseline(plan)

    //#then nothing is invented
    expect(baseline.effort).toBeNull()
    expect(baseline.complexity).toBeNull()
  })
})

describe("collectObservedExecutionFacts", () => {
  test("reduces gathered facts to observed execution counts", () => {
    //#given gathered progress, drift and a notepad blocker count
    const facts = collectObservedExecutionFacts({
      progress: progress(11, 12),
      drift: drift(24),
      notepadBlockerEntries: 3,
    })

    //#then the observed side is code-read, never modelled
    expect(facts).toEqual({
      tasksExecuted: 11,
      filesTouched: 24,
      notepadBlockerEntries: 3,
    })
  })
})

describe("checkCalibrationBaseline", () => {
  test("is the code-computable existence sub-check of a MODEL dimension", () => {
    //#given a plan that did store an estimate
    const baseline = parsePlanTimeBaseline(ENUM_PLAN)

    //#when only the existence sub-check is evaluated
    const check = checkCalibrationBaseline(baseline)

    //#then it reports presence and refuses to emit a score of its own
    expect(check.status).toBe("baseline_present")
    expect("score" in check).toBe(false)
  })

  test("returns unscorable when no plan-time baseline exists", () => {
    //#given a plan that stored no estimate
    const baseline = parsePlanTimeBaseline("# Title\n")

    //#when the existence sub-check is evaluated
    const check = checkCalibrationBaseline(baseline)

    //#then it is unscorable — never 0, never 1
    expect(check.status).toBe("unscorable")
    if (check.status === "unscorable") expect(check.reason).toContain(NO_BASELINE)
  })
})

describe("renderCalibrationComparison — a baseline exists", () => {
  test("renders Required Effort as verbatim baseline beside observed facts, with no delta", () => {
    //#given a bare enum baseline "Large" and 12 plan tasks
    const baseline = parsePlanTimeBaseline(ENUM_PLAN)
    //#given 12 tasks executed, 40 files touched, 3 notepad Blockers
    const observed = collectObservedExecutionFacts({
      progress: progress(12, 12),
      drift: drift(40),
      notepadBlockerEntries: 3,
    })

    //#when the comparison is rendered
    const sections = renderCalibrationComparison({ baseline, observed })

    //#then the verbatim baseline sits beside the observed facts
    expect(sections.requiredEffort).toContain('estimated tier "Large" (verbatim from the plan, line 2)')
    expect(sections.requiredEffort).toContain("12 tasks executed, 40 files touched, 3 notepad Blockers")
    //#then the tier is never converted into a number the plan never asserted
    expectNoArithmeticDelta(sections.requiredEffort)
  })

  test("reproduces a free-form prose baseline verbatim in the comparison", () => {
    //#given a corpus-style prose baseline
    const baseline = parsePlanTimeBaseline(PROSE_PLAN)
    const observed = collectObservedExecutionFacts({
      progress: progress(6, 6),
      drift: drift(9),
      notepadBlockerEntries: 1,
    })

    //#when the comparison is rendered
    const sections = renderCalibrationComparison({ baseline, observed })

    //#then the whole prose string survives into the report
    expect(sections.requiredEffort).toContain("Medium (≈1–2 agent-days of wall-clock, gated by 24 headless runs)")
  })

  test("still renders Effort and synthesises no C-level when only effort was stored", () => {
    //#given a plan with an effort baseline and no Complexity line
    const baseline = parsePlanTimeBaseline(ENUM_PLAN)
    const observed = collectObservedExecutionFacts({
      progress: progress(12, 12),
      drift: drift(40),
      notepadBlockerEntries: 3,
    })

    //#when the comparison is rendered
    const sections = renderCalibrationComparison({ baseline, observed })

    //#then the Effort comparison is present
    expect(sections.requiredEffort).toContain('estimated tier "Large"')
    //#then Complexity reads as absent rather than borrowing the effort word
    expect(sections.complexity).toContain(NO_BASELINE)
    expect(sections.complexity).not.toContain('"Large"')
  })
})

describe("renderCalibrationComparison — no baseline", () => {
  test("keeps the Complexity section present and says why it is empty", () => {
    //#given a plan that stored no estimate at all
    const baseline = parsePlanTimeBaseline("# Title\n\n- [ ] 1. do the thing\n")
    const observed = collectObservedExecutionFacts({
      progress: progress(12, 12),
      drift: drift(40),
      notepadBlockerEntries: 3,
    })

    //#when the comparison is rendered
    const sections = renderCalibrationComparison({ baseline, observed })

    //#then both sections render, and Complexity states the reason
    expect(sections.complexity).toContain(NO_BASELINE)
    expect(sections.complexity).toContain("no **Complexity** line in the plan")
    expect(sections.requiredEffort).toContain(NO_BASELINE)
    //#then the observed side is still reported beside the missing baseline
    expect(sections.complexity).toContain("12 tasks executed, 40 files touched, 3 notepad Blockers")
  })

  test("no numeric estimate appears when no baseline was recorded", () => {
    //#given a plan with no stored estimate
    const baseline = parsePlanTimeBaseline("# Title\n")
    const observed = collectObservedExecutionFacts({
      progress: progress(12, 12),
      drift: drift(40),
      notepadBlockerEntries: 3,
    })

    //#when the comparison is rendered
    const sections = renderCalibrationComparison({ baseline, observed })

    //#then the only digits on either line are the observed counts, never an estimate
    // (the fixed phrases naming dimension 8 and the rejected score of 0 are stripped first —
    // they are rubric vocabulary, not an estimate)
    const digitsInEffort = sections.requiredEffort
      .replace(/dimension 8/g, "")
      .replace(/not 0/g, "")
      .match(/\d+/g)
    expect(digitsInEffort).toEqual(["12", "40", "3"])
    expect(sections.complexity).toContain("unscorable")
  })
})

describe("module hygiene", () => {
  test("no completion-review source file references the routing-only complexity heuristic", () => {
    //#given every source file in the completion-review feature
    const dir = join(import.meta.dir, "../../../src/features/completion-review")
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"))

    //#when each file is read
    const offenders = files.filter((f) => {
      const text = readFileSync(join(dir, f), "utf8")
      return text.includes("autoScoreComplexity") || text.includes("COMPLEXITY_DESCRIPTIONS")
    })

    //#then the routing-only heuristic stays out of the reviewer's vocabulary
    expect(offenders).toEqual([])
  })
})
