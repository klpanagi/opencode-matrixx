/**
 * Task 5 — dimension 5, deliverable drift: the plan's Concrete Deliverables
 * H3 against the actual `git diff` the gatherer already collected.
 */
import type { DeterministicInputs, DimensionResult } from "./rubric-types"

const NO_SECTION = "plan has no Concrete Deliverables section"
const NO_PATHS = "Concrete Deliverables section names no file paths"

function baseName(path: string): string {
  const parts = path.split("/")
  return parts[parts.length - 1] ?? path
}

export function computeDeliverableDrift(input: DeterministicInputs): DimensionResult {
  if (input.drift.unscorable) {
    return { status: "unscorable", reason: input.drift.unscorableReason ?? "drift is not measurable" }
  }
  if (input.declaredDeliverables === null) return { status: "unscorable", reason: NO_SECTION }
  if (input.declaredDeliverables.length === 0) return { status: "unscorable", reason: NO_PATHS }

  const changed = input.drift.nameStatus.map((f) => f.path)
  const changedBases = new Set(changed.map(baseName))
  const matched = input.declaredDeliverables.filter((p) => changed.includes(p) || changedBases.has(baseName(p)))

  return {
    status: "scored",
    score: matched.length / input.declaredDeliverables.length,
    signals: {
      matchedDeliverables: matched.length,
      declaredDeliverables: input.declaredDeliverables.length,
      changedFiles: changed.length,
    },
  }
}
