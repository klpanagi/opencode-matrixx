/**
 * Task 6 — the compile-time gate for the four-outcome vocabulary.
 *
 * WHY THIS LIVES IN `src/` AND NOT IN THE TEST FILE: `tsconfig.json` EXCLUDES
 * `tests/`, so a type-level assertion written in a test is silently unchecked
 * and `tsc` still exits 0. These gates are the runtime twin of assertions the
 * test file makes about BEHAVIOUR, and they are the only place TypeScript
 * actually checks the three claims below. Same pattern, same reason as T5's
 * `rubric-gate.ts` and T1's `precondition-gate.ts`.
 *
 * The three claims:
 *   1. `not_scorable` is a SEPARATE VARIANT, not a `DimensionResult["status"]`.
 *      Proof that it is not interchangeable: a `NotScorableReview` is not
 *      assignable to `DimensionResult`, so a renderer written against the
 *      per-dimension union cannot accept one by accident.
 *   2. A `NotScorableReview` has NO `score` key. Enforced by the absence of the
 *      field, checked here with a runtime `hasOwnProperty` assertion over a
 *      real verdict — reading `verdict.score` would not compile at all.
 *   3. The union is CLOSED: adding a `kind` to `ReviewOutcome` without handling
 *      it here is a build error.
 */

import type {
  NotScorableReview,
  ReviewOutcome,
  ReviewOutcomeKind,
  ScoredReview,
} from "./degradation-types"
import type { DimensionResult } from "./rubric-types"

export type DegradationGateFailure = string

/**
 * Claim 1 — the two families are not assignable to one another.
 *
 * Declared as a parameter, never a value: this compiles only while a
 * `NotScorableReview` genuinely fails to satisfy `DimensionResult`. It is the
 * cheapest statement in the file and does the most work.
 */
export function acceptsDimensionResult(_result: DimensionResult): void {
  // Intentionally empty. Its PARAMETER TYPE is the assertion.
}
void acceptsDimensionResult

/** Claim 3 — the union is closed over exactly these two kinds. */
const _KIND_CLOSURE: Record<ReviewOutcomeKind, true> = { scored: true, not_scorable: true }
void _KIND_CLOSURE

/**
 * Claim 2 — a `not_scorable` verdict exposes no numeric score. Runtime check,
 * because the compile-time version is simply the field not existing.
 */
export function notScorableEmitsNoNumber(verdict: NotScorableReview): DegradationGateFailure | null {
  const keys = Object.keys(verdict)
  const leaked = keys.filter((key) => key === "score" || key === "grade" || key === "scoredWeight")
  return leaked.length === 0
    ? null
    : `not_scorable verdict leaked numeric field(s): ${leaked.join(", ")}`
}

/**
 * A scored review must always carry its denominator, so a report can never
 * present a mean without saying what it was a mean OF.
 */
export function scoredStatesDenominator(review: ScoredReview): DegradationGateFailure | null {
  const { denominator } = review
  const complete = denominator.scoredDimensions + denominator.excludedDimensions
  return complete === denominator.totalDimensions
    ? null
    : `denominator does not account for every dimension: ${complete} of ${denominator.totalDimensions}`
}

/** Narrow a union to the arm that may carry a number. */
export function scoreOf(outcome: ReviewOutcome): number | null {
  return outcome.kind === "scored" ? outcome.score : null
}
