/**
 * Task 7 — shapes for the calibration comparison.
 *
 * Types only, and every one of them is deliberately incapable of carrying a
 * fabricated score: there is no numeric field anywhere on a plan-time baseline,
 * because a tier string has no scale to convert it with.
 */

/** Where a plan-time baseline was STORED. Nothing here is re-derived. */
export type CalibrationBaselineSource = "ESTIMATED_EFFORT_LINE" | "COMPLEXITY_LINE"

/** One recorded plan-time estimate, reproduced exactly as the plan wrote it. */
export interface PlanTimeBaselineField {
  source: CalibrationBaselineSource
  /** The plan's own words, untouched. Never coerced to a level or a number. */
  verbatim: string
  /** 1-based plan line the value was read from; `null` when absent. */
  line: number | null
}

export interface PlanTimeBaseline {
  effort: PlanTimeBaselineField | null
  complexity: PlanTimeBaselineField | null
}

/** What execution actually did, as far as code could read it. */
export interface ObservedExecutionFacts {
  tasksExecuted: number
  filesTouched: number
  notepadBlockerEntries: number
}

/**
 * The ONLY code-computable part of dimension 8.
 *
 * Presence is arithmetic-free and needs no judgement. The over/under DIRECTION
 * is an ordinal-vs-ordinal read and belongs to the model, which is why this
 * carries no `score`: emitting one here is exactly the fabrication the task
 * forbids.
 */
export type CalibrationBaselineCheck =
  | { status: "baseline_present"; baseline: PlanTimeBaseline }
  | { status: "unscorable"; reason: string }

export interface CalibrationRenderInput {
  baseline: PlanTimeBaseline
  observed: ObservedExecutionFacts
}

/** The two report sections this module owns the CONTENT of. */
export interface CalibrationComparison {
  complexity: string
  requiredEffort: string
}
