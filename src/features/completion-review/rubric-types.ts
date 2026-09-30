/**
 * Task 5 — rubric types. The `kind` tag is enforced HERE, by the type system.
 *
 * The canonical shape is a discriminated union on `kind`: the DETERMINISTIC
 * variant REQUIRES `compute`, the MODEL variant FORBIDS it. There is therefore
 * no shape that can be tagged deterministic without a code implementation, and
 * no shape that can smuggle a model-informed observed side in under a MODEL
 * tag. Both errors are compile errors, not conventions.
 *
 * Purity is enforced the same way: `compute` accepts `DeterministicInputs`,
 * which is a Pick over the gatherer's FACT types only. No prose field, no
 * judgement callback and no model read is reachable from it. A dimension that
 * wants one is a MODEL dimension — the sanctioned fix is a RE-TAG, never a
 * widened `compute`.
 */
import type { DoDEvidence } from "./evidence-types"
import type { GatheredReviewInputs } from "./gather-types"

/** The Test Decision H3, reduced to a fact. `null` when the section is absent. */
export interface TestDecisionFacts {
  plannedTdd: boolean
  declaredTaskCount: number
}

/** Test files observed in the diff. `null` when the caller gathered nothing. */
export interface TestObservationFacts {
  testFiles: number
  tddMarkedTests: number
}

/**
 * Everything a deterministic dimension is allowed to read.
 *
 * A `Pick` of the gatherer's fact types plus two caller-supplied structural
 * extracts. `tasks` and `admission` are deliberately absent — dimension 1 uses
 * `dod` and `evidence`, and a dimension needing a free-text field cannot be
 * spelled here, which is the point.
 */
export type DeterministicInputs = Pick<
  GatheredReviewInputs,
  "dod" | "progress" | "attribution" | "drift" | "degradation"
> & {
  evidence: readonly DoDEvidence[]
  /** File paths named in the Concrete Deliverables H3; `null` when absent. */
  declaredDeliverables: readonly string[] | null
  testDecision: TestDecisionFacts | null
  tests: TestObservationFacts | null
}

/** Extra counters a dimension reports next to its score. Never a verdict. */
export interface DimensionSignals {
  [key: string]: number | boolean | string | undefined
}

export interface ScoredResult {
  status: "scored"
  /** 0..1, continuous. */
  score: number
  signals?: DimensionSignals
}

export interface UnscorableResult {
  status: "unscorable"
  reason: string
}

/** A `compute` never throws; inability to measure is a value, not an exception. */
export type DimensionResult = ScoredResult | UnscorableResult

/** Dimension 1's precise return: the all-pass / avg-pass GAP is a first-class field. */
export type DoDCoverageResult = UnscorableResult | (ScoredResult & {
  allPass: boolean
  avgPass: number
  gap: number
  dodTotal: number
  passed: number
  failed: number
  unverifiable: number
})

interface DimensionBase {
  /** 1-based plan dimension number. */
  index: number
  id: string
  title: string
  weight: number
  description: string
}

export interface DeterministicDimension extends DimensionBase {
  kind: "DETERMINISTIC"
  compute: (input: DeterministicInputs) => DimensionResult
}

export interface ModelDimension extends DimensionBase {
  kind: "MODEL"
  /** Forbidden: a model read cannot be code-computed. */
  compute?: undefined
}

export type RubricDimension = DeterministicDimension | ModelDimension
