/**
 * Task 2 — data shapes for the deterministic completion-review gatherer.
 *
 * Types only. Every value here is a FACT, never a verdict: the gatherer
 * reports what it read and how soft it is, and the rubric (T5) and the report
 * writer (T6) decide what a fact means.
 */
import type { PlanProgress } from "../mission-state/types"
import type { PlanTask } from "../plan-contract/types"

/**
 * Why an input is soft.
 *
 * `kind` guarantees the ARITHMETIC is code. It says nothing about whether the
 * INPUTS are grounded. Purity and provenance are orthogonal; `attribution`
 * below is what supplies provenance.
 */
export type Provenance = "heuristic" | "measured" | "recorded"

export interface GatherProvenance {
  /** Task→plan linkage is a convention, not a foreign key. */
  linkage: Provenance
  /** `checkboxOverlap` reconciliation is best-effort, never ground truth. */
  checkboxSync: Provenance
}

export interface ProgressFacts extends PlanProgress {
  remaining: number
}

/**
 * Attribution completeness — the REQUIRED provenance check.
 *
 * `linkedTerminal` comes from the 6-rule resolver at
 * `plan-persister/task-link.ts`; `planTasks` is the plan's own numbered task
 * count. When they disagree, the caller DEGRADES the attribution-dependent
 * dimensions to `unscorable`. It never scores them on partial evidence.
 */
export interface AttributionFacts {
  linkedTotal: number
  linkedTerminal: number
  planTasks: number
  /** `linkedTerminal / planTasks`, or 0 when the plan has no tasks. */
  ratio: number
  /** True only when `linkedTerminal` accounts for every plan task. */
  matches: boolean
}

export interface LinkedTerminalTask {
  id: string
  status: string
  terminal: boolean
}

export interface NotepadRecord {
  taskId: string | null
  file: string
  hasCompletionStamp: boolean
  results: string
}

/**
 * Admission corroboration — two INDEPENDENT inputs for T10's gate, gathered
 * here so the gate is a pure conjunction over collected facts and never a
 * second, divergent gatherer. Never derived from `isComplete`.
 */
export interface AdmissionFacts {
  linkedTerminalTasks: LinkedTerminalTask[]
  notepadCompletionStamps: string[]
  notepads: NotepadRecord[]
  corroborationCount: number
}

export interface ChangedFile {
  status: string
  path: string
}

export interface DriftFacts {
  startCommit: string | null
  stat: string | null
  nameStatus: ChangedFile[]
  /** True when the plan records no start commit — dimension 5 is unscorable. */
  unscorable: boolean
  unscorableReason: string | null
}

export interface DegradationFacts {
  unscorableDimensions: number[]
  reasons: Record<string, string>
}

export interface GatheredReviewInputs {
  planPath: string
  planName: string
  bytes: number
  provenance: GatherProvenance
  progress: ProgressFacts
  tasks: PlanTask[]
  dod: string[]
  attribution: AttributionFacts
  admission: AdmissionFacts
  drift: DriftFacts
  degradation: DegradationFacts
}

/** Read-only command runner for `git`. Injected so the gatherer stays pure. */
export type GitRunner = (args: string[]) => string

export interface GatherSources {
  /** Project root. Everything else is resolved beneath it. */
  directory: string
  /** Defaults to the newest reviewable plan. */
  planPath?: string
  /** Defaults to `.matrixx/notepads/<planName>`. */
  notepadDir?: string
  /** Session ids the plan has been worked under; a linkage signal. */
  sessionIds?: string[]
  /** Overrides the recorded start commit (used by tests). */
  startCommit?: string
  runGit?: GitRunner
}
