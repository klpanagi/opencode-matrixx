/**
 * Task 6 — the composition layer: the plan gate, then the rubric, then the
 * denominator. Everything above is consumed here; nothing is recomputed.
 *
 * ORDER IS THE SEMANTICS:
 *   1. plan gate (`degradation-vacuity`) — `not_scorable` short-circuits the
 *      whole review and returns BEFORE `scoreRubric` is ever called, so no
 *      number exists to leak. This is why the gate is not a dimension.
 *   2. per-item `unverifiable` collapse (`degradation-items`) — supplies
 *      `excludedItems` for DoD coverage. T5's `computeDoDCoverage` already
 *      decides scored-vs-unscorable; this layer only REPORTS the count.
 *   3. absent MODEL sections (`degradation-model`) — an absent section means
 *      "do not pass a model score for this dimension", which is what makes
 *      `scoreRubric` mark it `unscorable` and leave it out of `scoredWeight`.
 *   4. `scoreRubric` (T5) — the mean is ITS output. The weighted mean is never
 *      recomputed here, which is what keeps `unscorable` excluded rather than
 *      zeroed: `scoredWeight` is the denominator T5 already divided by.
 *
 * LOCKED DECISION #2: a low score and an unscorable plan are ADVISORY. This
 * module throws nothing, blocks nothing, and returns no exit code.
 */
import { collapseUnverifiable } from "./degradation-items"
import { missingSectionReason } from "./degradation-model"
import type {
  DimensionState,
  NotScorableReview,
  ReviewOutcome,
  ScoredReview,
} from "./degradation-types"
import { notScorableReason } from "./degradation-types"
import { planGateCause, planGateReason } from "./degradation-vacuity"
import type { ProgressFacts } from "./gather-types"
import { RUBRIC_DIMENSIONS } from "./rubric-dimensions"
import { scoreRubric } from "./rubric-score"
import type { DeterministicInputs, RubricDimension } from "./rubric-types"

export interface ReviewInput {
  progress: ProgressFacts
  deterministicInputs: DeterministicInputs
  modelScores: Partial<Record<string, number>>
  /** MODEL dimension ids whose plan section is absent. Empty when none are. */
  missingModelSections?: readonly string[]
  dimensions?: readonly RubricDimension[]
}

/** The `not_scorable` verdict for a plan that must not be scored, or `null`. */
export function planGateVerdict(
  progress: ProgressFacts,
  dimensions: readonly RubricDimension[] = RUBRIC_DIMENSIONS,
): NotScorableReview | null {
  const cause = planGateCause(progress)
  const reason = planGateReason(progress)
  if (cause === null || reason === null) return null
  return {
    kind: "not_scorable",
    cause,
    reason: notScorableReason(cause),
    dimensions: dimensions.map((d) => ({ index: d.index, id: d.id, outcome: "not_scorable" as const })),
    progress,
  }
}

/**
 * Drop model scores for dimensions whose section is absent, so `scoreRubric`
 * reports them `unscorable` and excludes their weight. This is the only place
 * the two vocabularies meet: the decision belongs to the gate, the arithmetic
 * belongs to T5.
 */
function applyMissingSections(
  modelScores: Partial<Record<string, number>>,
  missing: readonly string[],
): Partial<Record<string, number>> {
  if (missing.length === 0) return modelScores
  const filtered: Partial<Record<string, number>> = { ...modelScores }
  for (const id of missing) delete filtered[id]
  return filtered
}

function dimensionStates(
  dimensions: readonly RubricDimension[],
  results: ScoredReview["results"],
  excludedItems: Readonly<Record<string, number>>,
): DimensionState[] {
  return dimensions.map((dimension) => ({
    index: dimension.index,
    id: dimension.id,
    kind: dimension.kind,
    weight: dimension.weight,
    result: results[dimension.id] ?? { status: "unscorable", reason: "no result produced" },
    excludedItems: excludedItems[dimension.id] ?? 0,
  }))
}

/** The whole review. `kind` decides whether a number exists — see the union. */
export function evaluateReview(input: ReviewInput): ReviewOutcome {
  const dimensions = input.dimensions ?? RUBRIC_DIMENSIONS

  const gated = planGateVerdict(input.progress, dimensions)
  if (gated !== null) return gated

  const collapsed = collapseUnverifiable(input.deterministicInputs.evidence)
  const excludedItems: Record<string, number> = { "dod-coverage": collapsed.excluded }

  const missing = input.missingModelSections ?? []
  const modelScores = applyMissingSections(input.modelScores, missing)
  const scored = scoreRubric(dimensions, input.deterministicInputs, modelScores)

  return {
    kind: "scored",
    score: scored.score,
    grade: scored.grade,
    denominator: {
      totalDimensions: dimensions.length,
      scoredDimensions: dimensions.length - scored.unscorable.length,
      excludedDimensions: scored.unscorable.length,
      scoredWeight: scored.scoredWeight,
    },
    results: scored.results,
    dimensions: dimensionStates(dimensions, scored.results, excludedItems),
  }
}

export { missingSectionReason }
