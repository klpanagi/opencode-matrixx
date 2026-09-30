/// <reference types="bun-types" />
/**
 * Task 9 fixtures. Every sidecar is built through T4's OWN `buildReviewSidecar`
 * from T4's own `input()`, so the reader's input is proven to be the real shipped
 * shape rather than a shape invented here.
 */
import { buildReviewSidecar } from "../../../src/features/completion-review/report-sidecar"
import type { ReviewFinding, ReviewInput, ReviewSidecar } from "../../../src/features/completion-review/report-types"
import { input } from "./report-fixtures"

export interface SidecarOverrides {
  plan: string
  plannedEffort?: string | null
  plannedComplexity?: string | null
  observed?: string | null
  findings?: ReviewFinding[]
}

export function finding(code: ReviewFinding["code"], dimensionId: string): ReviewFinding {
  return { code, dimensionId, detail: `${code} on ${dimensionId}` }
}

export function sidecar(over: SidecarOverrides): ReviewSidecar {
  const base: ReviewInput = input({
    planName: over.plan,
    planPath: `.matrixx/plans/${over.plan}.md`,
    effort: {
      planned: over.plannedEffort ?? "Large",
      observed: over.observed ?? "12 tasks executed, 40 files touched, 3 notepad Blockers",
      comparison: null,
      note: "calibration",
    },
    complexity: { planned: over.plannedComplexity ?? null, observed: null, comparison: null, note: "calibration" },
    findings: over.findings ?? [],
  })
  return buildReviewSidecar(base)
}
