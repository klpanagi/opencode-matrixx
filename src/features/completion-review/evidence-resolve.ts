import type { DoDEvidence, EvidenceOutcome, EvidenceProvenance } from "./evidence-types"
import { EVIDENCE_PROVENANCE } from "./evidence-types"

/**
 * Resolve one DoD line to an outcome plus its provenance.
 *
 * The honesty rule lives here: only a machine-written completion yields `pass`.
 * No evidence — or evidence that is merely a file's existence — yields
 * `unverifiable`, never `pass` and never `fail`. `fail` stays in the union for
 * callers that can observe a negative terminal state, but this function has no
 * way to distinguish one and deliberately emits no fabricated failures.
 */
export function resolveDoDEvidence(input: {
  itemId: string
  notepad: { taskId: string | null; completed: boolean } | null
  evidenceFiles: readonly string[]
}): DoDEvidence {
  const files = [...input.evidenceFiles]
  const machineWritten = input.notepad?.completed === true
  const hasFile = files.length > 0

  const provenance: EvidenceProvenance = machineWritten
    ? EVIDENCE_PROVENANCE.NOTEPAD
    : hasFile
      ? EVIDENCE_PROVENANCE.CONVENTION_FILE
      : EVIDENCE_PROVENANCE.NONE

  const outcome: EvidenceOutcome = machineWritten ? "pass" : "unverifiable"

  return { itemId: input.itemId, outcome, provenance, taskId: input.notepad?.taskId ?? null, evidenceFiles: files }
}
