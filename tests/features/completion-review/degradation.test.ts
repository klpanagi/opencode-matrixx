/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import { detectMissingModelSections } from "../../../src/features/completion-review/degradation-model"
import { collapseUnverifiable } from "../../../src/features/completion-review/degradation-items"
import { evaluateReview, planGateVerdict } from "../../../src/features/completion-review/degradation-evaluate"
import { NOT_SCORABLE_REASONS } from "../../../src/features/completion-review/degradation-types"
import { RUBRIC_DIMENSIONS } from "../../../src/features/completion-review/rubric-dimensions"
import type { DeterministicInputs } from "../../../src/features/completion-review/rubric-types"
import { buildSectionIndex } from "../../../src/tools/plan/section-index"
import {
  CLEAN_DEGRADATION,
  COMPLETE_PROGRESS,
  evidence,
  MATCHING_ATTRIBUTION,
  MEASURED_DRIFT,
  PLAN_WITHOUT_GUARDRAILS,
  PLAN_WITH_ALL_H3,
  UNFINISHED_PROGRESS,
  ZERO_CHECKBOX_PROGRESS,
} from "./degradation-fixtures"

const TOTAL_DIMENSIONS = RUBRIC_DIMENSIONS.length

function inputs(overrides: Partial<DeterministicInputs> = {}): DeterministicInputs {
  return {
    dod: ["lint passes", "typecheck passes"],
    progress: COMPLETE_PROGRESS,
    attribution: MATCHING_ATTRIBUTION,
    drift: MEASURED_DRIFT,
    degradation: CLEAN_DEGRADATION,
    evidence: evidence("pass", "pass"),
    declaredDeliverables: ["src/a.ts", "src/b.ts"],
    testDecision: { plannedTdd: true, declaredTaskCount: 4 },
    tests: { testFiles: 2, tddMarkedTests: 2 },
    ...overrides,
  }
}

describe("plan-level not_scorable gate", () => {
  test("a zero-checkbox plan is not_scorable for all 8 dimensions, not a 1.0", () => {
    //#given a plan with zero checkbox items, which isComplete reports as complete BY VACUITY
    const progress = ZERO_CHECKBOX_PROGRESS

    //#when the review evaluates the plan
    const outcome = evaluateReview({
      progress,
      deterministicInputs: inputs({ progress }),
      modelScores: {},
    })

    //#then it is not_scorable for every dimension, with the vacuity reason named
    expect(outcome.kind).toBe("not_scorable")
    if (outcome.kind !== "not_scorable") throw new Error("expected not_scorable")
    expect(outcome.dimensions).toHaveLength(TOTAL_DIMENSIONS)
    expect(outcome.dimensions.every((d) => d.outcome === "not_scorable")).toBe(true)
    expect(outcome.reason).toBe(NOT_SCORABLE_REASONS.vacuousCompleteness)
    expect(outcome.reason).toMatch(/vacuit/i)
  })

  test("a not_scorable verdict emits NO numeric score field at all", () => {
    //#given a vacuous plan
    const progress = ZERO_CHECKBOX_PROGRESS

    //#when the review evaluates it
    const outcome = evaluateReview({
      progress,
      deterministicInputs: inputs({ progress }),
      modelScores: { "goal-attainment": 1 },
    })

    //#then no score key exists — not 0, not 1.0, not null
    if (outcome.kind !== "not_scorable") throw new Error("expected not_scorable")
    expect("score" in outcome).toBe(false)
    expect("grade" in outcome).toBe(false)
    expect(JSON.stringify(outcome)).not.toContain("1.0")
  })

  test("an unfinished plan is not_scorable for the WHOLE review — no partial score", () => {
    //#given 5 tasks with 2 completed, so execution is still in flight
    const progress = UNFINISHED_PROGRESS

    //#when the review evaluates it
    const outcome = evaluateReview({
      progress,
      deterministicInputs: inputs({ progress }),
      modelScores: { "goal-attainment": 0.9 },
    })

    //#then the entire review is not_scorable, citing incomplete execution
    expect(outcome.kind).toBe("not_scorable")
    if (outcome.kind !== "not_scorable") throw new Error("expected not_scorable")
    expect(outcome.reason).toBe(NOT_SCORABLE_REASONS.executionIncomplete)
    expect(outcome.dimensions).toHaveLength(TOTAL_DIMENSIONS)
    expect("score" in outcome).toBe(false)
  })

  test("a complete plan with no gate problem is scored, not not_scorable", () => {
    //#given a fully executed plan
    const progress = COMPLETE_PROGRESS

    //#when the review evaluates it
    const outcome = evaluateReview({ progress, deterministicInputs: inputs({ progress }), modelScores: {} })

    //#then the gate does not fire
    expect(outcome.kind).toBe("scored")
    expect(planGateVerdict(progress)).toBeNull()
  })
})

describe("unscorable is excluded from the weighted mean, never scored 0", () => {
  test("a MODEL dimension with an absent section is excluded, not zeroed", () => {
    //#given a plan whose guardrails H3 is absent
    const sectionIndex = buildSectionIndex(PLAN_WITHOUT_GUARDRAILS)

    //#when the missing sections are detected
    const missing = detectMissingModelSections(sectionIndex)

    //#then guardrail-adherence is reported absent by registry resolution, not by string match
    expect(missing).toContain("guardrail-adherence")
    expect(missing).not.toContain("verifiability")
  })

  test("a MODEL dimension scored 0 is IN the mean, unlike an absent-section one", () => {
    //#given every MODEL dimension scored, one of them genuinely at 0
    const progress = COMPLETE_PROGRESS
    const modelScores = {
      "goal-attainment": 0,
      "guardrail-adherence": 1,
      completeness: 1,
      verifiability: 1,
      "estimate-calibration": 1,
    }

    //#when the review scores the plan
    const outcome = evaluateReview({ progress, deterministicInputs: inputs({ progress }), modelScores })

    //#then all 8 count, and the 0 drags the mean down — a real 0 is not an exclusion
    if (outcome.kind !== "scored") throw new Error("expected scored")
    expect(outcome.results["goal-attainment"].status).toBe("scored")
    expect(outcome.results["goal-attainment"]).toMatchObject({ score: 0 })
    expect(outcome.denominator.scoredDimensions).toBe(TOTAL_DIMENSIONS)
    expect(outcome.denominator.scoredWeight).toBeCloseTo(1, 5)
    expect(outcome.score).toBeLessThan(1)
  })

  test("an excluded dimension lowers scoredWeight, and the denominator reports how many of 8", () => {
    //#given every MODEL dimension unscorable, so only the 3 deterministic ones remain
    const progress = COMPLETE_PROGRESS

    //#when the review scores the plan
    const outcome = evaluateReview({
      progress,
      deterministicInputs: inputs({ progress }),
      modelScores: {},
    })

    //#then the denominator states the shortfall instead of the mean being deflated
    if (outcome.kind !== "scored") throw new Error("expected scored")
    expect(outcome.denominator.totalDimensions).toBe(TOTAL_DIMENSIONS)
    expect(outcome.denominator.scoredDimensions).toBe(3)
    expect(outcome.denominator.excludedDimensions).toBe(5)
    expect(outcome.denominator.scoredWeight).toBeCloseTo(0.4, 5)
    // 3 deterministic dimensions all score 1.0, and the excluded 0.6 does not deflate the mean
    expect(outcome.score).toBeCloseTo(1, 5)
  })

  test("a fully absent section list is empty for a plan that has all three rubric H3s", () => {
    //#given a plan carrying the guardrails H3
    const sectionIndex = buildSectionIndex(PLAN_WITH_ALL_H3)

    //#when missing sections are detected
    const missing = detectMissingModelSections(sectionIndex)

    //#then nothing is reported absent
    expect(missing).toEqual([])
  })
})

describe("unverifiable is a per-ITEM outcome, distinct from unscorable", () => {
  test("an item with no evidence is unverifiable, not fail and not unscorable", () => {
    //#given one passing item and one with no evidence
    const items = evidence("pass", "unverifiable")

    //#when the items collapse
    const collapsed = collapseUnverifiable(items)

    //#then the unverifiable item is excluded individually and the rest still score
    expect(collapsed.kind).toBe("scored")
    if (collapsed.kind !== "scored") throw new Error("expected scored")
    expect(collapsed.excluded).toBe(1)
    expect(collapsed.scored).toHaveLength(1)
  })

  test("an all-unverifiable dimension collapses to unscorable, reporting the excluded count", () => {
    //#given every DoD item lacks machine-written evidence
    const items = evidence("unverifiable", "unverifiable", "unverifiable")

    //#when the items collapse
    const collapsed = collapseUnverifiable(items)

    //#then the dimension is unscorable with the excluded count — NOT a score of 0
    expect(collapsed.kind).toBe("unscorable")
    if (collapsed.kind !== "unscorable") throw new Error("expected unscorable")
    expect(collapsed.excluded).toBe(3)
    expect(collapsed.reason).toMatch(/3/)
    expect("score" in collapsed).toBe(false)
  })

  test("an all-unverifiable dimension is excluded from the mean, not scored 0", () => {
    //#given a plan whose only DoD items are unverifiable
    const progress = COMPLETE_PROGRESS
    const unverifiableEvidence = evidence("unverifiable", "unverifiable")

    //#when the review scores it
    const outcome = evaluateReview({
      progress,
      deterministicInputs: inputs({ progress, evidence: unverifiableEvidence }),
      modelScores: {},
    })

    //#then dimension 1 is unscorable and the mean is unchanged by its absence
    if (outcome.kind !== "scored") throw new Error("expected scored")
    expect(outcome.results["dod-coverage"].status).toBe("unscorable")
    expect(outcome.denominator.scoredDimensions).toBe(2)
    expect("score" in outcome.results["dod-coverage"]).toBe(false)
  })

  test("unverifiable and unscorable are different outcomes at the type level", () => {
    //#given the two reason vocabularies
    const collapse = collapseUnverifiable(evidence("unverifiable"))
    const gate = planGateVerdict(ZERO_CHECKBOX_PROGRESS)

    //#then a collapsed dimension reports an EXCLUDED COUNT, which a plan-level verdict has no field for
    expect(collapse.kind === "unscorable" ? collapse.excluded : 0).toBe(1)
    expect(gate).not.toBeNull()
    if (gate === null) throw new Error("expected a verdict")
    expect("excluded" in gate).toBe(false)
    expect(gate.dimensions.every((d) => d.outcome === "not_scorable")).toBe(true)
  })
})
