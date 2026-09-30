/**
 * Task 5 — dimension 7, whether the plan's own Test Decision held in execution.
 *
 * A plan that declared TDD required and produced no test file has broken its
 * own decision. A plan that declared no TDD has nothing to honour, which is a
 * pass on the DECISION, not a pass on quality — the signal records which.
 */
import type { DeterministicInputs, DimensionResult } from "./rubric-types"

const NO_SECTION = "plan has no Test Decision section"
const NO_OBSERVATION = "no test files were observed for the diff"

export function computeTestDecisionHonored(input: DeterministicInputs): DimensionResult {
  const attributionReason = input.degradation.reasons["7"]
  if (attributionReason !== undefined) return { status: "unscorable", reason: attributionReason }
  if (input.testDecision === null) return { status: "unscorable", reason: NO_SECTION }
  if (input.tests === null) return { status: "unscorable", reason: NO_OBSERVATION }

  const { plannedTdd, declaredTaskCount } = input.testDecision
  if (!plannedTdd) {
    return {
      status: "scored",
      score: 1,
      signals: { plannedTdd: false, testFiles: input.tests.testFiles, tddMarkedTests: input.tests.tddMarkedTests },
    }
  }
  if (input.tests.testFiles === 0) {
    return { status: "scored", score: 0, signals: { plannedTdd: true, testFiles: 0, tddMarkedTests: 0 } }
  }
  return {
    status: "scored",
    score: input.tests.tddMarkedTests / input.tests.testFiles,
    signals: {
      plannedTdd: true,
      testFiles: input.tests.testFiles,
      tddMarkedTests: input.tests.tddMarkedTests,
      declaredTaskCount,
    },
  }
}
