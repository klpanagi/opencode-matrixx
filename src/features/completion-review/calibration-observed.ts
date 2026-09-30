/**
 * Task 7 — the observed side of the comparison.
 *
 * Observed complexity is what execution demonstrably did: tasks executed, files
 * touched, notepad blockers. It is never modelled, and never a re-run keyword
 * heuristic over the plan text.
 */

import type { ObservedExecutionFacts } from "./calibration-types"
import type { DriftFacts, ProgressFacts } from "./gather-types"

export interface ObservedFactSources {
  progress: ProgressFacts
  drift: DriftFacts
  /** `## Blockers` entries counted in the plan's notepads by the caller. */
  notepadBlockerEntries: number
}

export function collectObservedExecutionFacts(sources: ObservedFactSources): ObservedExecutionFacts {
  return {
    tasksExecuted: sources.progress.completed,
    filesTouched: sources.drift.nameStatus.length,
    notepadBlockerEntries: sources.notepadBlockerEntries,
  }
}
