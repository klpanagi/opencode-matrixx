/**
 * Task 7 — the code-computable half of dimension 8.
 *
 * "Did the plan store a baseline at all?" is arithmetic-free and needs no
 * judgement, so it is code. "Was that estimate right?" is an ordinal-vs-ordinal
 * read of the comparison and is the MODEL's call — which is why this function
 * returns presence and never a `score`.
 */
import type { CalibrationBaselineCheck, PlanTimeBaseline } from "./calibration-types"

const NO_BASELINE = "no baseline recorded: the plan stored neither a **Complexity** nor an **Estimated Effort** line"

export function checkCalibrationBaseline(baseline: PlanTimeBaseline): CalibrationBaselineCheck {
  if (baseline.complexity === null && baseline.effort === null) {
    return { status: "unscorable", reason: NO_BASELINE }
  }
  return { status: "baseline_present", baseline }
}
