/// <reference types="bun-types" />
import type { DoDEvidence } from "../../../src/features/completion-review/evidence-types"
import type {
  AttributionFacts,
  DegradationFacts,
  DriftFacts,
  ProgressFacts,
} from "../../../src/features/completion-review/gather-types"

/** A fully-completed plan: 4 of 4 items, no triage needed. */
export const COMPLETE_PROGRESS: ProgressFacts = {
  total: 4,
  completed: 4,
  remaining: 0,
  isComplete: true,
}

/**
 * The vacuous-completeness trap, reproduced with the exact shape
 * `countPlanProgressFromContent` returns for a zero-checkbox plan:
 * `isComplete: true` BY VACUITY, plus `needsTriage: true`.
 */
export const ZERO_CHECKBOX_PROGRESS: ProgressFacts = {
  total: 0,
  completed: 0,
  remaining: 0,
  isComplete: true,
  needsTriage: true,
}

/** 5 tasks, 2 completed — the unfinished-plan scenario. */
export const UNFINISHED_PROGRESS: ProgressFacts = {
  total: 5,
  completed: 2,
  remaining: 3,
  isComplete: false,
}

export const MATCHING_ATTRIBUTION: AttributionFacts = {
  linkedTotal: 4,
  linkedTerminal: 4,
  planTasks: 4,
  ratio: 1,
  matches: true,
}

export const CLEAN_DEGRADATION: DegradationFacts = {
  unscorableDimensions: [],
  reasons: {},
}

export const MEASURED_DRIFT: DriftFacts = {
  startCommit: "abc1234",
  stat: "3 files changed",
  nameStatus: [
    { status: "M", path: "src/a.ts" },
    { status: "M", path: "src/b.ts" },
  ],
  unscorable: false,
  unscorableReason: null,
}

/** Evidence items. `unverifiable` is a real outcome, not a stand-in for `fail`. */
export function evidence(...outcomes: ("pass" | "fail" | "unverifiable")[]): DoDEvidence[] {
  return outcomes.map((outcome, i) => ({
    itemId: `dod-${i + 1}`,
    outcome,
    provenance: outcome === "pass" ? "notepad (machine-written)" : "none",
    taskId: outcome === "pass" ? `T-${i + 1}` : null,
    evidenceFiles: outcome === "unverifiable" ? [] : [],
  }))
}

/** A minimal plan that carries the three rubric H3s the reviewer reads. */
export const PLAN_WITH_ALL_H3 = [
  "# Plan",
  "",
  "## Work Objectives",
  "",
  "Do the thing.",
  "",
  "### Must NOT Have (Guardrails)",
  "",
  "- No new dependencies",
  "",
  "### Concrete Deliverables",
  "",
  "- src/a.ts",
  "- src/b.ts",
  "",
  "### Test Decision",
  "",
  "TDD required.",
  "",
].join("\n")

/** The same plan with the guardrails H3 removed — a section that is ABSENT. */
export const PLAN_WITHOUT_GUARDRAILS = [
  "# Plan",
  "",
  "## Work Objectives",
  "",
  "Do the thing.",
  "",
  "### Concrete Deliverables",
  "",
  "- src/a.ts",
  "- src/b.ts",
  "",
  "### Test Decision",
  "",
  "TDD required.",
  "",
].join("\n")
