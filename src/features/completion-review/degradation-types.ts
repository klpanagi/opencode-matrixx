/**
 * Task 6 — the four degradation outcomes, and why three of them are not one.
 *
 * The vocabulary is a DISCRIMINATED UNION on `kind`, and the split is not
 * cosmetic. Three of the four outcomes are answers about a DIMENSION; the
 * fourth is an answer about the PLAN, and conflating the two is the bug this
 * module exists to make impossible.
 *
 * - `scored`       — the dimension was computed. A number exists.
 * - `unscorable`   — a dimension with no computable input: a MODEL dimension
 *                    whose section is absent, or a DETERMINISTIC one with no
 *                    item left to measure. No number is invented, and the
 *                    dimension is EXCLUDED from the weighted mean — scoring it
 *                    0 would punish a plan for omitting a section it never
 *                    promised.
 * - `unverifiable` — a per-ITEM outcome (T8's `EvidenceOutcome`). It is NOT a
 *                    dimension status: items are excluded individually, and
 *                    only the collapse of an all-`unverifiable` set produces a
 *                    dimension-level `unscorable`.
 * - `not_scorable` — a PLAN-LEVEL gate. Structurally a SEPARATE VARIANT with
 *                    no `score` field at all, so a caller cannot read a number
 *                    off it even by accident.
 *
 * WHY `not_scorable` IS STRUCTURALLY DISTINCT RATHER THAN A STATUS STRING:
 * if it were `DimensionResult["status"] = "not_scorable"`, then any
 * `if (r.status === "unscorable")` — written for the much milder
 * "excluded from the mean" case — would silently admit a plan that must emit
 * no number whatsoever. Making it a variant of `ReviewOutcome` instead means
 * narrowing on `kind` is what admits a score, and the compiler rejects the
 * read. That is the whole argument, and it is checkable.
 *
 * LOCKED DECISION #2: a low score and an unscorable plan are ADVISORY. Nothing
 * in this file throws, blocks, or returns an exit code.
 */
import type { ProgressFacts } from "./gather-types"
import type { ApbGrade } from "./rubric-score"
import type { DimensionResult, RubricDimension } from "./rubric-types"

/** Why a plan is not scorable at all. Two causes, both plan-level. */
export type NotScorableCause = "vacuous_completeness" | "execution_incomplete"

export const NOT_SCORABLE_REASONS = {
  vacuousCompleteness:
    "plan declares zero checkbox items — isComplete is true by vacuity, so no dimension is measurable",
  executionIncomplete:
    "plan execution is not complete — a post-execution review does not score a plan that is still running",
} as const satisfies Record<string, string>

const REASON_BY_CAUSE: Record<NotScorableCause, string> = {
  vacuous_completeness: NOT_SCORABLE_REASONS.vacuousCompleteness,
  execution_incomplete: NOT_SCORABLE_REASONS.executionIncomplete,
}

/** The reason text for a cause. Exhaustive by construction over the union. */
export function notScorableReason(cause: NotScorableCause): string {
  return REASON_BY_CAUSE[cause]
}

/** A dimension's state inside a scored review. `unscorable` is never a 0. */
export interface DimensionState {
  index: number
  id: string
  kind: RubricDimension["kind"]
  weight: number
  result: DimensionResult
  /** Items dropped as `unverifiable`. 0 for every dimension but DoD coverage. */
  excludedItems: number
}

/**
 * How much of the rubric actually produced a number. The report states this
 * explicitly, because a mean over an unstated denominator is a lie by omission.
 */
export interface ScoringDenominator {
  totalDimensions: number
  scoredDimensions: number
  excludedDimensions: number
  /** Sum of the weights that produced a score — consumed, never recomputed. */
  scoredWeight: number
}

/** The review produced a number. */
export interface ScoredReview {
  kind: "scored"
  score: number
  grade: ApbGrade
  denominator: ScoringDenominator
  results: Record<string, DimensionResult>
  dimensions: DimensionState[]
}

/**
 * The plan itself is not scorable. NOT a `DimensionResult` and NOT carrying a
 * `score`: the absence of the field is the guarantee, and `degradation-gate.ts`
 * makes TypeScript enforce it.
 */
export interface NotScorableReview {
  kind: "not_scorable"
  cause: NotScorableCause
  reason: string
  /** Every dimension, each explicitly `not_scorable` — never a placeholder 0. */
  dimensions: { index: number; id: string; outcome: "not_scorable" }[]
  progress: ProgressFacts
}

/**
 * The four outcomes, in their two families. Narrow on `kind`:
 * `scored` carries a number, `not_scorable` does not.
 */
export type ReviewOutcome = ScoredReview | NotScorableReview

/** Compile-time closure: adding an outcome to either family is a build error. */
export type ReviewOutcomeKind = ReviewOutcome["kind"]

const _OUTCOME_KIND_GATE: Record<ReviewOutcomeKind, true> = {
  scored: true,
  not_scorable: true,
}
void _OUTCOME_KIND_GATE
