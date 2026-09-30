/// <reference types="bun-types" />
/**
 * Task 4 fixtures. No `mock.module()`: every value is a plain structural
 * object, so the renderer under test is the real one.
 */
import { RUBRIC_DIMENSIONS } from "../../../src/features/completion-review/rubric-dimensions"
import type {
  AdmissionFacts,
  AttributionFacts,
  ProgressFacts,
} from "../../../src/features/completion-review/gather-types"
import { EVIDENCE_PROVENANCE } from "../../../src/features/completion-review/evidence-types"
import type { ReviewDimension, ReviewInput } from "../../../src/features/completion-review/report-types"

const { NOTEPAD, CONVENTION_FILE } = EVIDENCE_PROVENANCE

export const PLAN_NAME = "demo-plan"
export const PLAN_PATH = `.matrixx/plans/${PLAN_NAME}.md`
export const GENERATED_AT = "2026-09-29T00:00:00.000Z"

export function progress(over: Partial<ProgressFacts> = {}): ProgressFacts {
  return { total: 4, completed: 4, remaining: 0, isComplete: true, ...over }
}

export function admission(count: number): AdmissionFacts {
  return {
    linkedTerminalTasks: Array.from({ length: count }, (_, i) => ({
      id: `T-${i}`,
      status: "completed",
      terminal: true,
    })),
    notepadCompletionStamps: Array.from({ length: count }, (_, i) => `task-${i}`),
    notepads: [],
    corroborationCount: count,
  }
}

export function attribution(over: Partial<AttributionFacts> = {}): AttributionFacts {
  return { linkedTotal: 4, linkedTerminal: 4, planTasks: 4, ratio: 1, matches: true, ...over }
}

/** All 8 dimensions, scored unless `unscorableIds` names one. */
export function dimensions(over: Partial<Record<string, Partial<ReviewDimension>>> = {}): ReviewDimension[] {
  return RUBRIC_DIMENSIONS.map((d) => {
    const patch = over[d.id] ?? {}
    const unscorable = patch.outcome === "unscorable"
    return {
      index: d.index,
      id: d.id,
      title: d.title,
      kind: d.kind,
      weight: d.weight,
      outcome: patch.outcome ?? "scored",
      score: unscorable ? null : (patch.score ?? 0.8),
      rationale: patch.rationale ?? (unscorable ? "not measurable from gathered facts" : "measured"),
      ...(patch.signals ? { signals: patch.signals } : {}),
    } as ReviewDimension
  })
}

export function input(over: Partial<ReviewInput> = {}): ReviewInput {
  return {
    planPath: PLAN_PATH,
    planName: PLAN_NAME,
    generatedAt: GENERATED_AT,
    coverageClass: "post-capture",
    progress: progress(),
    admission: admission(2),
    attribution: attribution(),
    provenance: { gather: { linkage: "heuristic", checkboxSync: "heuristic" }, evidence: [NOTEPAD] },
    score: { value: 0.8, grade: 0.8, scoredWeight: 1, dimensionCount: 8 },
    dimensions: dimensions(),
    complexity: { planned: "medium", observed: "medium", comparison: "on target", note: "calibrated" },
    effort: { planned: "2 sessions", observed: "2 sessions", comparison: "on target", note: "calibrated" },
    findings: [],
    ...over,
  }
}

/** A dimension set where DoD carries the counters `classifyFindings` reads. */
export function scoredDownInput(): ReviewInput {
  const dims = dimensions({
    "dod-coverage": {
      score: 0.5,
      rationale: "4 of 5 DoD items verified; 1 unverifiable, 1 failed; all-pass and avg-pass diverge",
      signals: { passed: 3, failed: 1, unverifiable: 1, gap: 0.25, allPass: false },
    },
    "deliverable-drift": { score: 0.75, rationale: "3 of 4 declared deliverables appear in the diff" },
    "test-decision-honored": { score: 0.5, rationale: "plan declared TDD; no TDD-marked test found" },
    "guardrail-adherence": { score: 0.6, rationale: "a guardrail was relaxed during execution" },
  })
  return input({ dimensions: dims, score: { value: 0.64, grade: 0.6, scoredWeight: 1, dimensionCount: 8 } })
}

export const CONVENTION_ONLY = CONVENTION_FILE
