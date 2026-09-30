/**
 * Task 4 — the admission gate, as a PURE function over two gathered facts.
 *
 * LOCKED decision #2 applies to this file most sharply: the gate has NO
 * consumer in code. It is rendered because the DoD mandates it, and it must
 * therefore never become a control-flow branch. `deriveGateState` returns data;
 * nothing branches on it, nothing exits non-zero, nothing blocks.
 *
 * The two independent signals are `progress.isComplete` (the plan's own
 * checkboxes) and `admission.corroborationCount` (task-store terminal records
 * plus machine-written notepad completion stamps). `corroborationCount >= 2`
 * means they were corroborated by both.
 *
 * The two failure modes are kept APART on purpose:
 *
 * - `disagree` — one signal says the work is finished and the other does not.
 *   That is a finding about the plan, and it is rendered by name.
 * - `unavailable` — corroboration is STRUCTURALLY absent (0 or 1 of 2 signals),
 *   so there is nothing to disagree with. This is the vacuous case T2 calls out:
 *   a zero-task plan reports `isComplete: true` with zero corroboration.
 *
 * Collapsing them would be a lie: "unavailable" is not "the signals conflict",
 * it is "the signals were never there".
 */
import type { AdmissionFacts, ProgressFacts } from "./gather-types"
import type { GateEvidence, GateState, ReviewGate } from "./report-types"

const CORROBORATION_REQUIRED = 2

export function deriveGateState(
  progress: ProgressFacts,
  admission: AdmissionFacts,
): ReviewGate {
  const count = admission.corroborationCount
  const evidence: GateEvidence = count >= CORROBORATION_REQUIRED ? "corroborated" : "unavailable"
  const state = decide(progress, admission)
  return {
    state,
    evidence,
    corroborationCount: count,
    detail: detailFor(state, progress, count),
  }
}

/**
 * The independent signal is PRESENT when at least one of the two artefacts
 * exists. Mirrors `signalsPresent` in `admission-gate.ts`: presence is
 * checked BEFORE the conflict case, because "the signals were never there"
 * and "the signals conflict" are different statements.
 */
function signalsPresent(admission: AdmissionFacts): boolean {
  return admission.linkedTerminalTasks.length > 0 || admission.notepadCompletionStamps.length > 0
}

function decide(progress: ProgressFacts, admission: AdmissionFacts): GateState {
  const count = admission.corroborationCount
  if (!signalsPresent(admission)) return "unavailable"
  if (progress.isComplete !== count >= CORROBORATION_REQUIRED) return "disagree"
  if (progress.isComplete) return "agree"
  return count >= CORROBORATION_REQUIRED ? "disagree" : "unavailable"
}

function detailFor(state: GateState, progress: ProgressFacts, count: number): string {
  if (state === "agree") {
    return `The plan reports complete and ${count} of ${CORROBORATION_REQUIRED} independent signals corroborate it.`
  }
  if (state === "disagree") {
    return `The plan reports isComplete=${String(progress.isComplete)} but only ${count} of ${CORROBORATION_REQUIRED} independent signals corroborate it. The two signals disagree; neither is treated as ground truth.`
  }
  return `gateEvidence: "unavailable" — ${count} of ${CORROBORATION_REQUIRED} independent signals are present, so corroboration is structurally absent and there is nothing to disagree with.`
}

/** The vacuous case T2 calls out: a zero-task plan reports complete with nothing to back it. */
export function needsTriageNote(progress: ProgressFacts): string {
  if (progress.needsTriage !== true) return ""
  return " The plan needs triage: a vacuously-complete plan has no tasks, so no signal can ever corroborate it."
}
