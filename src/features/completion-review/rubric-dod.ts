/**
 * Task 5 — dimension 1, DoD coverage, with the all-pass / avg-pass GAP.
 *
 * PlanningBench's finding is that the two metrics diverge sharply: a plan can
 * pass every check or pass most of them, and only the mean hides how close a
 * plan came to a total miss. The gap is therefore computed and returned here,
 * not left for a caller to re-derive from `allPass` and `avgPass`.
 */
import type { DeterministicInputs, DoDCoverageResult } from "./rubric-types"

const NO_DOD = "plan declares no Definition-of-Done lines"

export function computeDoDCoverage(input: DeterministicInputs): DoDCoverageResult {
  const attributionReason = input.degradation.reasons["1"]
  if (attributionReason !== undefined) return { status: "unscorable", reason: attributionReason }

  const dodTotal = input.dod.length
  if (dodTotal === 0) return { status: "unscorable", reason: NO_DOD }

  let passed = 0
  let failed = 0
  let unverifiable = 0
  for (const item of input.evidence) {
    if (item.outcome === "pass") passed += 1
    else if (item.outcome === "fail") failed += 1
    else unverifiable += 1
  }

  if (passed === 0 && failed === 0) {
    return {
      status: "unscorable",
      reason: `no DoD item has machine-written evidence (${unverifiable} unverifiable)`,
    }
  }

  const avgPass = passed / dodTotal
  const allPass = passed === dodTotal
  return {
    status: "scored",
    score: avgPass,
    allPass,
    avgPass,
    gap: 1 - avgPass,
    dodTotal,
    passed,
    failed,
    unverifiable,
  }
}
