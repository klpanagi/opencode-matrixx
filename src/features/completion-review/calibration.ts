/**
 * Task 7 — report sections (c) Complexity and (d) Required Effort, as
 * CALIBRATION COMPARISONS.
 *
 * The question these sections answer is not "how hard was this?" but "was the
 * plan's own estimate right, given what actually happened?" That makes the
 * completion reviewer an INSTRUMENT rather than a gate: every completed plan
 * contributes a row to a corpus of estimate accuracy, and that corpus is the
 * only way to find out whether the plan-generation heuristic runs wide. One
 * review's comparison is noise; fifty of them are a signal — and the signal is
 * about the PLAN GENERATOR, not the executor.
 *
 * Three rules make the corpus trustworthy, and each is a hard constraint rather
 * than a style preference:
 *
 * 1. **The baseline is STORED, never re-derived.** It is read from the
 *    `**Estimated Effort**` line the plan skeleton already emits (the PRIMARY
 *    source, carried by 33 of the corpus plans — but only 20 of those are a bare
 *    enum word, so the parser preserves free-form prose verbatim). There is no
 *    optional front-matter estimate field yet and nothing that would write one;
 *    when one lands it is a SECONDARY source, below the line, never a substitute
 *    for it.
 * 2. **The observed side is OBSERVED, not modelled** — tasks executed, files
 *    touched, notepad `## Blockers` entries, all already collected by the
 *    gatherer. The routing-only C-level heuristic is deliberately not imported
 *    here: it feeds Seraph gating, and borrowing it as a quality signal would
 *    quietly change that gate.
 * 3. **No arithmetic delta is ever computed from a tier string.** A word like
 *    "Large" has no scale, so "under-estimated by 30%" would be a number the
 *    plan never asserted. The comparison is directional and qualitative, and
 *    the direction is dimension 8's call.
 *
 * Dimension 8 (`estimate-calibration`) is a MODEL dimension for exactly that
 * reason. Its one code-computable sub-part — "does a plan-time baseline exist at
 * all" — is `checkCalibrationBaseline`, and it returns presence without a
 * `score`. With no baseline, the answer is `unscorable`: never 0, never 1, and
 * never a synthesised level. A missing estimate is a gap in the PLAN, and
 * scoring it as a bad estimate would blame the executor for it.
 *
 * T4 owns the section headings; this module owns the content behind them, so
 * the renderer returns the two body lines and the caller places them under (c)
 * and (d).
 */

export { parsePlanTimeBaseline } from "./calibration-baseline"
export { checkCalibrationBaseline } from "./calibration-baseline-check"
export type { ObservedFactSources } from "./calibration-observed"
export { collectObservedExecutionFacts } from "./calibration-observed"
export { renderCalibrationComparison } from "./calibration-render"
export type {
  CalibrationBaselineCheck,
  CalibrationBaselineSource,
  CalibrationComparison,
  CalibrationRenderInput,
  ObservedExecutionFacts,
  PlanTimeBaseline,
  PlanTimeBaselineField,
} from "./calibration-types"
