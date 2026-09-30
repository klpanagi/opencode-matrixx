/**
 * Task 6 — the degradation semantics layer: `scored` / `unscorable` /
 * `unverifiable` / `not_scorable`.
 *
 * Read the types first (`degradation-types.ts`): the fourth outcome is a
 * separate variant of `ReviewOutcome` precisely so no caller can treat a plan
 * that must emit no number as a dimension that was merely excluded from the
 * mean.
 */

export type { ReviewInput } from "./degradation-evaluate"
export { evaluateReview, planGateVerdict } from "./degradation-evaluate"
export type { DegradationGateFailure } from "./degradation-gate"
export {
  notScorableEmitsNoNumber,
  scoredStatesDenominator,
  scoreOf,
} from "./degradation-gate"
export type { CollapsedItems } from "./degradation-items"
export { collapseUnverifiable, excludedCount } from "./degradation-items"
export { detectMissingModelSections, MODEL_SECTION_SOURCES } from "./degradation-model"
export type {
  DimensionState,
  NotScorableCause,
  NotScorableReview,
  ReviewOutcome,
  ReviewOutcomeKind,
  ScoredReview,
  ScoringDenominator,
} from "./degradation-types"
export { NOT_SCORABLE_REASONS, notScorableReason } from "./degradation-types"
export { isPlanNotScorable, planGateCause, planGateReason } from "./degradation-vacuity"
