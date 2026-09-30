/**
 * Task 10 — the `/plan-review` ADMISSION GATE, as a pure function over T2's
 * gathered facts.
 *
 * WHY THE GATE IS A CONJUNCTION AND NOT `isComplete`: `isComplete` derives
 * SOLELY from the plan's own checkboxes (`countPlanProgressFromContent`,
 * `mission-state/storage.ts:163-189` → `isComplete: total === 0 || completed
 * === total`), and those checkboxes are flipped by the fuzzy text-similarity
 * heuristic T2 explicitly refuses to trust (`checkboxOverlap`,
 * `mission-state/plan-storage.ts:98`). Admitting on `isComplete` alone would
 * decide admission on the exact artifact the report then labels untrustworthy.
 * So admission requires BOTH:
 *
 *   a. `isComplete === true` AND `needsTriage === false` — the second clause is
 *      what rejects vacuous completeness, because a zero-checkbox plan arrives
 *      with `isComplete: true`; and
 *   b. at least one INDEPENDENT corroborating terminal signal — a linked task in
 *      terminal status (6-rule resolver, `plan-persister/task-link.ts:5-15`) or
 *      a notepad `## Completion` stamp — whose records together ACCOUNT FOR the
 *      plan's declared work.
 *
 * Both are read from T2's `AdmissionFacts`. This module re-reads nothing: a
 * second, divergent gatherer is how two gates drift apart.
 *
 * ORDER IS THE SEMANTICS. `needsTriage` is consulted BEFORE `isComplete`,
 * because a vacuous plan reads as complete and the vacuous truth must not pass
 * as a genuine completion.
 *
 * THREE STATES, NOT TWO. `disagree` and `unavailable` are different statements:
 * the first is "the two signals conflict", the second is "the signals were
 * never there". Every plan executed before capture is structurally in the
 * second case (measured: `metadata.planName` appears in 0 of 48 task files,
 * completion stamps in 1 of 19 notepad buckets), so folding them together would
 * make `disagree` fire on every legacy plan and render the field as noise.
 * `gateDisagreement` is therefore real but DIAGNOSTIC-ONLY: no code reads it;
 * T4 renders it for the human reader and nothing branches on it.
 *
 * DISAGREEMENT NEVER PICKS A WINNER. When the signals conflict the gate
 * PROCEEDS and records the conflict by name. Hard refusal is reserved for
 * exactly two cases: vacuous completeness, or both signals saying incomplete.
 *
 * LOCKED decision #2: this module throws nothing, blocks nothing and returns no
 * exit code. A low score, and a gate that guesses wrong, are both advisory.
 */
import type { NotScorableCause } from "./degradation-types"
import type { AdmissionFacts, ProgressFacts } from "./gather-types"
import type { GateEvidence, GateState } from "./report-types"

/** Which signal carried the admission. Never left implicit in the record. */
export type AdmissionSignal = "checkboxes" | "corroboration"

/**
 * The gate's own honesty notice. It may be wrong in BOTH directions, and saying
 * so is part of the output rather than a caveat buried in a comment.
 */
export const GATE_HEURISTIC_WARNING =
  "This admission gate is a HEURISTIC and may be wrong in BOTH directions: it can refuse a genuinely finished plan whose checkboxes were never flipped, and it can admit a genuinely unfinished one. The recorded state below is a finding about the plan, not ground truth."

/** The measured gap behind `gateEvidence: "unavailable"`, quoted not paraphrased. */
export const UNAVAILABLE_EVIDENCE_GAP =
  "corroboration is structurally absent: `metadata.planName` appears in 0 of 48 task files, and a `## Completion` stamp in 1 of 19 notepad buckets"

/** A conflict between the two signals. Rendered for the reader; never branched on. */
export interface GateDisagreement {
  checkboxesSaysComplete: boolean
  corroborationSaysComplete: boolean
  resolved: "proceed"
  reason: string
}

export interface AdmissionDecision {
  outcome: "admitted" | "refused"
  /** `null` on refusal — nothing admitted the plan. */
  admittedBy: AdmissionSignal | null
  gateState: GateState
  gateEvidence: GateEvidence
  gateDisagreement: GateDisagreement | null
  reason: string
  /** `null` unless refused; the one of two causes that refused it. */
  refuseCause: NotScorableCause | null
  corroborationCount: number
  signalsPresent: { linkedTerminalTasks: number; notepadCompletionStamps: number }
}

export interface AdmissionInput {
  progress: ProgressFacts
  admission: AdmissionFacts
}

/** The independent signal is PRESENT when at least one of the two artefacts exists. */
function signalsPresent(admission: AdmissionFacts): boolean {
  return admission.linkedTerminalTasks.length > 0 || admission.notepadCompletionStamps.length > 0
}

/**
 * The independent signal says COMPLETE when its terminal records ACCOUNT FOR the
 * plan's declared work. Mere presence is not corroboration: one terminal task
 * against a five-task plan is a plan with four unaccounted tasks, and reading it
 * as agreement would admit on a partial artefact.
 */
function corroborationSaysComplete(progress: ProgressFacts, admission: AdmissionFacts): boolean {
  if (!signalsPresent(admission)) return false
  return progress.total > 0 && admission.corroborationCount >= progress.total
}

export function evaluateAdmission(input: AdmissionInput): AdmissionDecision {
  const { progress, admission } = input
  const present = signalsPresent(admission)
  const corroborates = corroborationSaysComplete(progress, admission)
  const base = {
    corroborationCount: admission.corroborationCount,
    signalsPresent: {
      linkedTerminalTasks: admission.linkedTerminalTasks.length,
      notepadCompletionStamps: admission.notepadCompletionStamps.length,
    },
  }

  if (progress.needsTriage === true) {
    return {
      ...base,
      outcome: "refused",
      admittedBy: null,
      gateState: "unavailable",
      gateEvidence: "unavailable",
      gateDisagreement: null,
      refuseCause: "vacuous_completeness",
      reason:
        "vacuous completeness: the plan declares zero checkbox items, so isComplete is true by vacuity and no signal could ever corroborate it",
    }
  }

  if (progress.isComplete !== true) {
    return {
      ...base,
      outcome: "refused",
      admittedBy: null,
      gateState: "unavailable",
      gateEvidence: present ? "corroborated" : "unavailable",
      gateDisagreement: null,
      refuseCause: "execution_incomplete",
      reason: "the plan is not complete: a post-execution review does not score a plan that is still running",
    }
  }

  if (!present) {
    return {
      ...base,
      outcome: "admitted",
      admittedBy: "checkboxes",
      gateState: "unavailable",
      gateEvidence: "unavailable",
      gateDisagreement: null,
      refuseCause: null,
      reason: `admitted on isComplete with needsTriage=false; ${UNAVAILABLE_EVIDENCE_GAP}. No gateDisagreement is recorded: absence is not conflict.`,
    }
  }

  if (!corroborates) {
    const reason = `checkboxes say complete (${progress.completed}/${progress.total}) but ${admission.corroborationCount} independent terminal records do not account for ${progress.total} declared tasks; the gate proceeds and records the conflict rather than picking a winner`
    return {
      ...base,
      outcome: "admitted",
      admittedBy: "checkboxes",
      gateState: "disagree",
      gateEvidence: "corroborated",
      gateDisagreement: {
        checkboxesSaysComplete: true,
        corroborationSaysComplete: false,
        resolved: "proceed",
        reason,
      },
      refuseCause: null,
      reason,
    }
  }

  return {
    ...base,
    outcome: "admitted",
    admittedBy: "corroboration",
    gateState: "agree",
    gateEvidence: "corroborated",
    gateDisagreement: null,
    refuseCause: null,
    reason: `checkboxes and ${admission.corroborationCount} independent terminal records agree that the work is finished`,
  }
}

