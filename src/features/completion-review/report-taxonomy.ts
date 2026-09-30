/**
 * Task 4 — the E1–E6 error taxonomy.
 *
 * Six codes, six DISTINCT causes, each attached to the dimension it belongs to.
 * The point of a code is that a corpus reader can count causes across hundreds
 * of reports without a model reading prose — so the mapping must be a total,
 * deterministic function of the dimension results, not a judgement call.
 *
 * The invariant this file exists to keep: EVERY dimension scored down carries a
 * code. A dimension that scored below 1 with no code would be a silent finding
 * the reader cannot count, which is the failure mode the taxonomy was invented
 * to prevent.
 *
 * Codes are derived, never supplied. `classifyFindings` reads the dimension
 * `signals` T5 already computes, so this file adds no judgement of its own.
 */
import type { AttributionFacts } from "./gather-types"
import type { ReviewDimension, ReviewFinding } from "./report-types"

const DOD = "dod-coverage"
const DRIFT = "deliverable-drift"
const TEST_DECISION = "test-decision-honored"

function num(dimension: ReviewDimension | undefined, key: string): number {
  const raw = dimension?.signals?.[key]
  return typeof raw === "number" ? raw : 0
}

function scoredBelow(dimension: ReviewDimension | undefined): boolean {
  return dimension?.outcome === "scored" && typeof dimension.score === "number" && dimension.score < 1
}

export function classifyFindings(dimensions: readonly ReviewDimension[]): ReviewFinding[] {
  const findings: ReviewFinding[] = []
  const byId = new Map(dimensions.map((d) => [d.id, d]))
  const dod = byId.get(DOD)
  const drift = byId.get(DRIFT)
  const tests = byId.get(TEST_DECISION)

  const unverifiable = num(dod, "unverifiable")
  if (unverifiable > 0) {
    findings.push({ code: "E1", dimensionId: DOD, detail: `${unverifiable} DoD items have no machine-written evidence and cannot be scored either way.` })
  }

  const failed = num(dod, "failed")
  if (failed > 0) {
    findings.push({ code: "E2", dimensionId: DOD, detail: `${failed} DoD items have machine-written evidence of failure.` })
  }

  const gap = num(dod, "gap")
  if (gap > 0) {
    findings.push({ code: "E3", dimensionId: DOD, detail: `All-pass and avg-pass diverge by ${gap.toFixed(2)}: the plan is not uniformly satisfied, and the mean alone hides which check failed.` })
  }

  if (scoredBelow(drift)) {
    findings.push({ code: "E4", dimensionId: DRIFT, detail: "At least one Concrete Deliverables path is absent from the actual git diff." })
  }

  if (scoredBelow(tests)) {
    findings.push({ code: "E5", dimensionId: TEST_DECISION, detail: "Execution did not honour the plan's own Test Decision." })
  }

  for (const dimension of dimensions) {
    if (dimension.kind !== "MODEL") continue
    if (!scoredBelow(dimension)) continue
    findings.push({
      code: "E6",
      dimensionId: dimension.id,
      detail: `A model read scored ${dimension.title} below 1; the shortfall is a judgement, not a measurement.`,
    })
  }

  return findings
}

/** Attribution mismatch is a plan-level observation, not a scored dimension. */
export function attributionMismatch(attribution: AttributionFacts): boolean {
  return attribution.planTasks > 0 && !attribution.matches
}
