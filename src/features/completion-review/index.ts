/**
 * Completion-review barrel.
 *
 * This file previously claimed "T8 owns the `evidence*` prefix and adds its own
 * re-exports here". T8 did not touch it, so that comment was false and
 * `resolveDoDEvidence`, `EVIDENCE_PROVENANCE` and `DoDEvidence` were unreachable
 * from the barrel. The re-exports are here now, and the comment is corrected
 * rather than left to mislead the next reader.
 *
 * The `report*` and `calibration*` re-exports are now here (T10 added them once
 * both modules had shipped and QA passed).
 *
 * Two things are deliberately named rather than `export *`:
 *
 * 1. `ReviewInput` exists TWICE under two unrelated meanings — T6's evaluator
 *    input and T4's renderer input — so forwarding both would make the barrel's
 *    `ReviewInput` ambiguous. The evaluator's is the one the barrel exposes.
 * 2. `calibration-corpus` re-exported wholesale: its surface (`readCalibrationCorpus`,
 *    `CorpusReport` and friends) collides with nothing else in this barrel, so
 *    there is no reason to name it piecemeal.
 */
export * from "./calibration"
export * from "./calibration-corpus"
export * from "./degradation"
export * from "./evidence-capture"
export * from "./evidence-notepad"
export * from "./evidence-resolve"
export * from "./evidence-types"
export * from "./gather"
export { renderReviewReport } from "./report"
export { buildReviewSidecar } from "./report-sidecar"
export { classifyFindings } from "./report-taxonomy"
export {
  ADVISORY_NOTICE,
  type CoverageClass,
  type DimensionOutcome,
  type FindingCode,
  type GateEvidence,
  type GateState,
  REVIEW_SIDECAR_VERSION,
  type ReviewCalibration,
  type ReviewDimension,
  type ReviewFinding,
  type ReviewGate,
  type ReviewProvenance,
  type ReviewScoreHeadline,
  type ReviewSidecar,
  type ReviewSidecarDimension,
} from "./report-types"
export { buildReviewDirCommand, REVIEWS_DIR, type ReviewWriteResult, reviewReportPath, reviewSidecarPath, writeReviewReport } from "./report-write"
export * from "./rubric"
