/**
 * Evidence vocabulary for the completion reviewer (dimension 1).
 *
 * The corpus in `.matrixx/evidence/` predates any capture helper — no program
 * in this repo writes there, so every pre-existing file is convention only.
 * The three provenance classes below are deliberately distinct strings so a
 * report can state, per DoD item, exactly how strong the backing is.
 */
export const EVIDENCE_PROVENANCE = {
  /** A notepad written by `task-notepad-writer` carrying a `## Completion` stamp. */
  NOTEPAD: "notepad (machine-written)",
  /** A file exists, but nothing proves a program wrote or validated it. */
  CONVENTION_FILE: "file presence only (convention)",
  /** Nothing at all backs the item. */
  NONE: "none",
} as const

export type EvidenceProvenance = (typeof EVIDENCE_PROVENANCE)[keyof typeof EVIDENCE_PROVENANCE]

/**
 * `unverifiable` is a first-class outcome, distinct from both `pass` and
 * `fail`. It means the reviewer found no evidence either way and refuses to
 * manufacture confidence. A DETERMINISTIC rubric dimension must therefore be
 * able to express "no evidence" as data rather than by throwing.
 */
export type EvidenceOutcome = "pass" | "fail" | "unverifiable"

export interface DoDEvidence {
  /** Identifier of the DoD line this resolves. */
  itemId: string
  outcome: EvidenceOutcome
  provenance: EvidenceProvenance
  /** Task ID from the notepad marker, when a machine-written notepad backs it. */
  taskId: string | null
  /** Evidence file names considered, in input order. */
  evidenceFiles: readonly string[]
}
