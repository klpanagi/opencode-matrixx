/**
 * Task 5 — the 8-dimension completion-review rubric.
 *
 * Three benchmarks shape this rubric, and each owns a different part of it:
 *
 * - **PlanBench** decomposes planning quality PER CAPABILITY rather than into a
 *   single verdict, and asks whether acceptance criteria are checkable at all
 *   (dimension 6) and whether the plan's own guardrails survived execution
 *   (dimension 2). It is the reason this is eight dimensions and not a score.
 * - **PlanningBench** found that **All-pass and Avg-pass diverge sharply**: a
 *   plan can pass most checks while failing the one that mattered, and only the
 *   mean hides that. Dimension 1 therefore returns `allPass`, `avgPass` and the
 *   GAP between them as first-class fields. The gap is the finding, not the mean.
 * - **APB** grades a plan on a DISCRETE ladder. `apbGrade` emits the coarse
 *   companion {0, .2, .4, .6, .8, 1} next to the continuous 0..1 score, so a
 *   reader who rounds 0.83 by hand still lands on the same rung.
 *
 * The `kind` tag is load-bearing and is enforced by the TYPE SYSTEM, not by
 * convention. `RubricDimension` is a discriminated union: the DETERMINISTIC
 * variant REQUIRES `compute`, the MODEL variant FORBIDS it. A dimension cannot
 * be mis-tagged without a `tsc` error, and a `compute` cannot reach a prose
 * field because its parameter type is a `Pick` over the gatherer's fact types.
 * The sanctioned fix for a dimension that cannot be made pure is a RE-TAG to
 * MODEL — never a widened `compute`, and never an unimplemented deterministic
 * dimension. Dimension 8 was re-tagged that way during the review pass.
 *
 * Degradation is data. `EvidenceOutcome` includes `unverifiable`, so a DoD item
 * with no machine-written evidence is never scored as a failure: dimension 1
 * counts it separately and, when NOTHING is verifiable, returns `unscorable`
 * with a reason instead of a fabricated 0. T6 renders these; T5 declares them.
 *
 * A low score is a finding, never a blocking failure. This module has no
 * process.exit, no threshold that halts anything, and no side effect at all.
 */
export { RUBRIC_DIMENSIONS, RUBRIC_KIND_PATTERN } from "./rubric-dimensions"
export { computeDoDCoverage } from "./rubric-dod"
export { computeDeliverableDrift } from "./rubric-drift"
export { checkRubricStructure } from "./rubric-gate"
export type { ApbGrade, RubricScore } from "./rubric-score"
export { apbGrade, scoreRubric, totalWeight } from "./rubric-score"
export { computeTestDecisionHonored } from "./rubric-test-decision"
export type {
  DeterministicDimension,
  DeterministicInputs,
  DimensionResult,
  DimensionSignals,
  DoDCoverageResult,
  ModelDimension,
  RubricDimension,
  ScoredResult,
  TestDecisionFacts,
  TestObservationFacts,
  UnscorableResult,
} from "./rubric-types"
