/**
 * Task 7 — rendering sections (c) Complexity and (d) Required Effort.
 *
 * The shape is a COMPARISON, never a score: the plan's own words, reproduced
 * verbatim, sitting BESIDE the facts execution demonstrably produced. No
 * subtraction, no percentage, no "under-estimated by N" — an ordinal tier has no
 * numeric scale, so any delta would be a number the plan never asserted.
 *
 * The absent-baseline path is handled FIRST because it is the common one: no
 * plan in the corpus records a **Complexity** line, so the honest default is a
 * section that renders and says why it is empty, not a section that invents a
 * level to fill itself.
 */
import type { CalibrationComparison, CalibrationRenderInput, ObservedExecutionFacts } from "./calibration-types"

const NO_BASELINE = "no baseline recorded"
const DIRECTION = "direction is a dimension 8 model read; an ordinal tier has no numeric scale, so no delta is computed"

function observedPhrase(observed: ObservedExecutionFacts): string {
  return `${observed.tasksExecuted} tasks executed, ${observed.filesTouched} files touched, ${observed.notepadBlockerEntries} notepad Blockers`
}

function complexityLine(input: CalibrationRenderInput): string {
  const { baseline, observed } = input
  const field = baseline.complexity
  if (field === null) {
    return `Complexity: ${NO_BASELINE} (no **Complexity** line in the plan — the C-level is never persisted, it is routing-only for the Seraph gate) — observed anyway: ${observedPhrase(observed)}; dimension 8 is unscorable on the complexity side`
  }
  return `Complexity: planned level "${field.verbatim}" (verbatim from the plan, line ${field.line}) vs observed: ${observedPhrase(observed)} — ${DIRECTION}`
}

function effortLine(input: CalibrationRenderInput): string {
  const { baseline, observed } = input
  const field = baseline.effort
  if (field === null) {
    return `Required Effort: ${NO_BASELINE} (no **Estimated Effort** line in the plan, and nothing writes the optional front-matter estimate field yet) — observed: ${observedPhrase(observed)}; dimension 8 is unscorable, not 0`
  }
  return `Required Effort: estimated tier "${field.verbatim}" (verbatim from the plan, line ${field.line}) vs observed: ${observedPhrase(observed)} — ${DIRECTION}`
}

export function renderCalibrationComparison(input: CalibrationRenderInput): CalibrationComparison {
  return { complexity: complexityLine(input), requiredEffort: effortLine(input) }
}
