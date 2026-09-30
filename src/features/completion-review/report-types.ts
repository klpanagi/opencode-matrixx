/**
 * Task 4 — the shapes the report renderer consumes, and the versioned `.json`
 * sidecar contract T9 reads.
 *
 * WHY THE FOUR PARTS EXIST: Summary, Score, Complexity and Required Effort are
 * the USER'S EXPLICIT format requirement (plan step 4). They are not this
 * module's invention and the renderer emits all four unconditionally, each
 * under its own `##` heading. If one is missing the report is wrong regardless
 * of what else it says.
 *
 * WHY THE REPORT IS WRITTEN OUT OF THE PLAN FILE: the plan is a record of
 * INTENT AND PROGRESS. A report appended to it corrupts both — the plan stops
 * describing what was planned, and the progress counters absorb prose they were
 * never meant to count. Every mature precedent splits the two: create-plan /
 * ravdeepss writes `plans/{NAME}_PROGRESS.json`, Goose writes a separate
 * `PROGRESS.md`, precisely to avoid parallel-subagent write conflicts on the
 * file agents edit. Splitting also removes the write-headroom problem that
 * motivated Plan A. Nothing in this feature may open the plan for writing.
 *
 * WHY A `.json` SIDECAR: the corpus reader (T9) must aggregate hundreds of
 * reviews without parsing prose. A regex over markdown is a contract that
 * breaks on the first reworded sentence; a versioned object does not.
 *
 * RECONCILIATION NOTE (T6, concurrent): `not_scorable` rendering is owned by
 * T6's degradation module. The renderer here consumes a *structural* union —
 * `outcome: "scored" | "unscorable" | "unverifiable"` — and renders every arm,
 * emitting no number whenever `outcome !== "scored"`. T6's `not_scorable`
 * result maps onto `outcome: "unscorable"` with its `reason` as the rationale,
 * so the two agree by construction; T10 must pass T6's reasons through as
 * `rationale`, not invent its own.
 */

import type { EvidenceProvenance } from "./evidence-types"
import type { AdmissionFacts, AttributionFacts, GatherProvenance, ProgressFacts } from "./gather-types"
import type { ApbGrade } from "./rubric-score"

/** Semver of the `.json` sidecar shape. Bump on ANY breaking field change. */
export const REVIEW_SIDECAR_VERSION = "1.0.0"

/** Rendered verbatim near the top of every report. See LOCKED decision #2. */
export const ADVISORY_NOTICE =
  "**A low score is advisory, not a gate.** This report has no exit code, no blocking error and no contract rule; nothing in the pipeline halts, retries or rejects a plan because of the number below."

/** `post-capture` plans have machine-written evidence; `legacy` ones predate it. */
export type CoverageClass = "post-capture" | "legacy"

/**
 * A dimension's outcome. `unscorable` and `unverifiable` are DISTINCT and both
 * emit no number: the first means the dimension could not be computed, the
 * second means it was computed and the evidence behind it was absent.
 */
export type DimensionOutcome = "scored" | "unscorable" | "unverifiable"

export interface ReviewDimension {
  index: number
  id: string
  title: string
  kind: "DETERMINISTIC" | "MODEL"
  weight: number
  outcome: DimensionOutcome
  /** 0..1, or `null` for any non-`scored` outcome. */
  score: number | null
  /** One line. For a non-`scored` outcome this is the `reason`. */
  rationale: string
  /** The dimension's own counters (T5's `DimensionSignals`), when it reported any. */
  signals?: Readonly<Record<string, number | boolean | string | undefined>>
}

/** T7 owns the CONTENT of these two; this module only renders them. */
export interface ReviewCalibration {
  /** Plan-time estimate, verbatim. `null` when the plan recorded none. */
  planned: string | null
  /** Observed effort, verbatim. `null` when nothing observed it. */
  observed: string | null
  /** `under` / `over` / `on-target`, or `null` when not comparable. */
  comparison: string | null
  note: string
}

export type GateState = "agree" | "disagree" | "unavailable"
export type GateEvidence = "corroborated" | "unavailable"

export interface ReviewGate {
  state: GateState
  evidence: GateEvidence
  corroborationCount: number
  detail: string
}

export type FindingCode = "E1" | "E2" | "E3" | "E4" | "E5" | "E6"

export interface ReviewFinding {
  code: FindingCode
  dimensionId: string
  detail: string
}

export interface ReviewProvenance {
  gather: GatherProvenance
  evidence: readonly EvidenceProvenance[]
}

export interface ReviewScoreHeadline {
  value: number
  grade: ApbGrade
  /** Sum of weights that produced a number; below 1 means partial measurement. */
  scoredWeight: number
  dimensionCount: number
}

export interface ReviewInput {
  planPath: string
  planName: string
  /**
   * ISO-8601, supplied by the caller. NEVER `new Date()` inside the renderer —
   * a clock read in a pure function makes two renders of identical input
   * differ, which is exactly the diff T9 needs to be able to make.
   */
  generatedAt: string
  coverageClass: CoverageClass
  progress: ProgressFacts
  admission: AdmissionFacts
  attribution: AttributionFacts
  provenance: ReviewProvenance
  score: ReviewScoreHeadline
  /** ALL 8 dimensions, in index order. A missing row shrinks the rubric. */
  dimensions: readonly ReviewDimension[]
  complexity: ReviewCalibration
  effort: ReviewCalibration
  findings: readonly ReviewFinding[]
}

/** Per-dimension row of the sidecar. Same discriminants as the markdown table. */
export interface ReviewSidecarDimension {
  index: number
  id: string
  kind: "DETERMINISTIC" | "MODEL"
  weight: number
  outcome: DimensionOutcome
  score: number | null
  rationale: string
  codes: FindingCode[]
}

export interface ReviewSidecar {
  sidecarVersion: typeof REVIEW_SIDECAR_VERSION
  plan: string
  planPath: string
  generatedAt: string
  coverageClass: CoverageClass
  advisory: true
  score: ReviewScoreHeadline
  dimensions: ReviewSidecarDimension[]
  findings: ReviewFinding[]
  gate: ReviewGate
  complexity: ReviewCalibration
  effort: ReviewCalibration
  provenance: ReviewProvenance
}
