/**
 * Task 4 — the versioned `.json` sidecar, split out of `report.ts` to keep that
 * renderer under the 200-LOC ceiling.
 *
 * This is the contract T9's corpus reader consumes. It exists so the reader
 * never parses a sentence: aggregating hundreds of reviews with a regex over
 * markdown is a contract that breaks on the first reworded heading, whereas a
 * versioned object breaks loudly instead.
 *
 * `REVIEW_SIDECAR_VERSION` is the ONLY field a reader needs in order to
 * decide whether it understands the rest. Bump it on any breaking change and
 * the reader can refuse rather than silently mis-read. Additive fields do not
 * require a bump; changing or removing one does.
 */
import { deriveGateState } from "./report-gate"
import {
  REVIEW_SIDECAR_VERSION,
  type ReviewInput,
  type ReviewSidecar,
  type ReviewSidecarDimension,
} from "./report-types"

function sidecarDimension(dimension: ReviewInput["dimensions"][number], input: ReviewInput): ReviewSidecarDimension {
  return {
    index: dimension.index,
    id: dimension.id,
    kind: dimension.kind,
    weight: dimension.weight,
    outcome: dimension.outcome,
    /** `null` for any non-`scored` outcome — the sidecar never invents a number. */
    score: dimension.outcome === "scored" ? dimension.score : null,
    rationale: dimension.rationale,
    codes: input.findings.filter((f) => f.dimensionId === dimension.id).map((f) => f.code),
  }
}

export function buildReviewSidecar(input: ReviewInput): ReviewSidecar {
  return {
    sidecarVersion: REVIEW_SIDECAR_VERSION,
    plan: input.planName,
    planPath: input.planPath,
    generatedAt: input.generatedAt,
    coverageClass: input.coverageClass,
    /** Present so a reader cannot mistake this object for a gate result. */
    advisory: true,
    score: input.score,
    dimensions: input.dimensions.map((d) => sidecarDimension(d, input)),
    findings: [...input.findings],
    gate: deriveGateState(input.progress, input.admission),
    complexity: input.complexity,
    effort: input.effort,
    provenance: input.provenance,
  }
}
