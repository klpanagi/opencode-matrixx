/**
 * Task 5 — weighted mean plus the APB-style discrete grade.
 *
 * Mirrors the shape of `src/features/evolution/evaluator.ts` (`EvalResult`: a
 * 0..1 score, clamped, with a companion verdict) — the repo's only existing
 * numeric rubric. APB's contribution is the coarse companion: a single number
 * from {0, .2, .4, .6, .8, 1}, which survives a reviewer misreading a 0.83.
 */
import { RUBRIC_DIMENSIONS } from "./rubric-dimensions"
import type { DeterministicInputs, DimensionResult, RubricDimension } from "./rubric-types"

/** The APB discrete ladder. A grade is always one of these. */
export type ApbGrade = 0 | 0.2 | 0.4 | 0.6 | 0.8 | 1

export interface RubricScore {
  /** Weighted mean over the SCORED dimensions, 0..1. */
  score: number
  /** Sum of the weights that actually produced a score. Below 1 means partial. */
  scoredWeight: number
  grade: ApbGrade
  unscorable: string[]
  results: Record<string, DimensionResult>
}

/** Round UP to the next rung on the ladder, except that 0 stays 0. */
export function apbGrade(score: number): ApbGrade {
  if (score <= 0) return 0
  if (score >= 1) return 1
  const rungs: ApbGrade[] = [0.2, 0.4, 0.6, 0.8]
  for (const rung of rungs) if (score <= rung + 1e-9) return rung
  return 1
}

export function totalWeight(dimensions: readonly RubricDimension[] = RUBRIC_DIMENSIONS): number {
  return dimensions.reduce((sum, d) => sum + d.weight, 0)
}

export function scoreRubric(
  dimensions: readonly RubricDimension[],
  input: DeterministicInputs,
  modelScores: Partial<Record<string, number>> = {},
): RubricScore {
  const results: Record<string, DimensionResult> = {}
  const unscorable: string[] = []
  let weighted = 0
  let scoredWeight = 0

  for (const dimension of dimensions) {
    const result =
      dimension.kind === "DETERMINISTIC"
        ? dimension.compute(input)
        : resolveModelScore(dimension.id, modelScores)
    results[dimension.id] = result
    if (result.status === "unscorable") {
      unscorable.push(dimension.id)
      continue
    }
    const score = clamp(result.score)
    weighted += score * dimension.weight
    scoredWeight += dimension.weight
  }

  const score = scoredWeight === 0 ? 0 : weighted / scoredWeight
  return { score: clamp(score), scoredWeight, grade: apbGrade(score), unscorable, results }
}

function resolveModelScore(
  id: string,
  modelScores: Partial<Record<string, number>>,
): DimensionResult {
  const raw = modelScores[id]
  if (raw === undefined) return { status: "unscorable", reason: `no model score supplied for ${id}` }
  return { status: "scored", score: clamp(raw) }
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}
