/**
 * Task 4 — the completion-review report: a PURE `(ReviewInput) => markdown`
 * renderer plus the versioned `.json` sidecar it mirrors.
 *
 * Purity is the load-bearing property and it is absolute. There is no
 * `new Date()`, no `Math.random()`, no filesystem call and no model call in
 * this module or anything it imports. `generatedAt` is an INPUT. Without that,
 * two renders of identical input would differ, and the corpus reader (T9)
 * could never diff two reviews to see what actually changed.
 *
 * Two reasons the report lives in `.matrixx/reviews/<plan>.md` and NEVER in the
 * plan file:
 *
 * 1. **Parallel-subagent write conflicts.** Every mature precedent splits the
 *    report out of the file agents edit — create-plan / ravdeepss writes
 *    `plans/{NAME}_PROGRESS.json`; Goose writes a separate `PROGRESS.md`.
 * 2. **The plan is a record of INTENT AND PROGRESS, and prose corrupts both.**
 *    A report appended to the plan stops the plan from describing what was
 *    planned, and its progress counters begin absorbing paragraphs they were
 *    never meant to count. Splitting also removes the write-headroom problem
 *    that motivated Plan A.
 *
 * The four required parts — Summary, Score, Complexity, Required Effort — are
 * the USER'S EXPLICIT format requirement (plan step 4), not an editorial
 * choice. They are emitted unconditionally, each under its own `##` heading,
 * and none of them is skipped when its data is absent: an absent comparison
 * renders as `not recorded`, never as a missing section.
 *
 * A LOW SCORE IS ADVISORY, NOT A GATE (LOCKED decision #2). This module has no
 * exit code, no threshold that halts anything, and no side effect. The
 * `ADVISORY_NOTICE` is rendered near the top so a reader who quotes a number
 * out of context also quotes the caveat.
 *
 * T6 RECONCILIATION: this renderer consumes a structural union
 * (`outcome: "scored" | "unscorable" | "unverifiable"`) and handles every arm,
 * emitting NO number unless `outcome === "scored"`. T6's `not_scorable` result
 * maps onto `outcome: "unscorable"` with its `reason` as the rationale. T10 must
 * pass T6's reasons through as `rationale` rather than inventing its own.
 */
import { deriveGateState, needsTriageNote } from "./report-gate"
import { renderSummary } from "./report-summary"
import { ADVISORY_NOTICE, REVIEW_SIDECAR_VERSION, type ReviewInput } from "./report-types"

/** Longest rationale kept in a table cell; markdown tables do not wrap. */
const RATIONALE_LIMIT = 120

function clamp(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim()
  return oneLine.length > RATIONALE_LIMIT ? `${oneLine.slice(0, RATIONALE_LIMIT - 1)}…` : oneLine
}

function cell(value: string): string {
  return clamp(value).replace(/\|/g, "\\|")
}

function dimensionCell(input: ReviewInput, id: string): string {
  return input.findings
    .filter((f) => f.dimensionId === id)
    .map((f) => f.code)
    .join(" ")
}

function renderResult(dimension: ReviewInput["dimensions"][number]): string {
  if (dimension.outcome === "scored" && dimension.score !== null) {
    return dimension.score.toFixed(2)
  }
  return dimension.outcome
}

function renderScoreSection(input: ReviewInput): string {
  const lines: string[] = [
    "## Score",
    "",
    `**Score**: ${input.score.value.toFixed(2)} (continuous, 0..1)`,
    `**APB grade**: ${input.score.grade} (discrete companion on {0, 0.2, 0.4, 0.6, 0.8, 1})`,
    "",
    `**Denominator**: ${input.dimensions.filter((d) => d.outcome === "scored").length} of ${input.dimensions.length} dimensions scored, covering a weight of ${input.score.scoredWeight.toFixed(2)} of 1.00. A weight below 1.00 means the score rests on partial measurement, not on a shrunken rubric.`,
    "",
    "| # | Dimension | Kind | Weight | Result | Codes | Rationale |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ]

  for (const dimension of input.dimensions) {
    lines.push(
      `| ${dimension.index} | ${cell(dimension.title)} | ${dimension.kind} | ${dimension.weight.toFixed(2)} | ${renderResult(dimension)} | ${dimensionCell(input, dimension.id) || "—"} | ${cell(dimension.rationale)} |`,
    )
  }

  return lines.join("\n")
}

function renderCalibrationSection(heading: string, calibration: ReviewInput["complexity"]): string {
  const value = (input: string | null): string => (input === null || input.trim() === "" ? "not recorded" : input)
  return [
    `## ${heading}`,
    "",
    `**Planned**: ${value(calibration.planned)}`,
    `**Observed**: ${value(calibration.observed)}`,
    `**Comparison**: ${value(calibration.comparison)}`,
    `**Note**: ${clamp(calibration.note)}`,
  ].join("\n")
}

function renderGateSection(input: ReviewInput): string {
  const gate = deriveGateState(input.progress, input.admission)
  const lines = [
    "## Admission Gate",
    "",
    `**Gate state**: ${gate.state}`,
    `**Gate evidence**: ${gate.evidence}`,
    `**Corroboration**: ${gate.corroborationCount} of 2 independent signals`,
    "",
    `${gate.detail}${needsTriageNote(input.progress)}`,
  ]
  if (gate.state === "disagree") {
    lines.push("", "The disagreement is rendered because the DoD mandates it. It has no consumer in code: it neither blocks nor scores.")
  }
  if (gate.evidence === "unavailable") {
    lines.push("", 'Rendered as `gateEvidence: "unavailable"`: corroboration is structurally absent, which is a different statement from the signals conflicting.')
  }
  return lines.join("\n")
}

function renderFindingsSection(input: ReviewInput): string {
  const lines = ["## Findings (E1–E6)", ""]
  if (input.findings.length === 0) {
    lines.push("No dimension was scored down; no taxonomy code applies.")
    return lines.join("\n")
  }
  for (const finding of input.findings) {
    lines.push(`- **${finding.code}** · ${finding.dimensionId} — ${clamp(finding.detail)}`)
  }
  return lines.join("\n")
}

function renderProvenanceSection(input: ReviewInput): string {
  const evidence = input.provenance.evidence.length > 0 ? input.provenance.evidence.join(", ") : "none observed"
  return [
    "## Provenance and Coverage",
    "",
    `- **Task→plan linkage**: ${input.provenance.gather.linkage}`,
    `- **Checkbox sync**: ${input.provenance.gather.checkboxSync}`,
    `- **Evidence provenance**: ${evidence}`,
    `- **Coverage class**: ${input.coverageClass}`,
    "",
    "`heuristic` and `file presence only (convention)` are honesty markers, not upgrades. Only a machine-written provenance yields a pass; a conventional file is never promoted to one.",
  ].join("\n")
}

function renderHeader(input: ReviewInput): string {
  return [
    `# Completion Review — ${input.planName}`,
    "",
    `- **Plan**: \`${input.planPath}\``,
    `- **Generated**: ${input.generatedAt} (supplied by the caller; the renderer reads no clock)`,
    `- **Sidecar**: \`.matrixx/reviews/${input.planName}.json\` (schema v${REVIEW_SIDECAR_VERSION})`,
    `- **Report is not written into the plan file**`,
    "",
    ADVISORY_NOTICE,
  ].join("\n")
}

/** Render the full report. Pure: same input, byte-identical output. */
export function renderReviewReport(input: ReviewInput): string {
  return [
    renderHeader(input),
    "",
    "## Summary",
    "",
    renderSummary(input).join(" "),
    "",
    renderScoreSection(input),
    "",
    renderCalibrationSection("Complexity", input.complexity),
    "",
    renderCalibrationSection("Required Effort", input.effort),
    "",
    renderGateSection(input),
    "",
    renderFindingsSection(input),
    "",
    renderProvenanceSection(input),
    "",
  ].join("\n")
}

export { deriveGateState } from "./report-gate"
export { buildReviewSidecar } from "./report-sidecar"
export { renderSummary } from "./report-summary"
export { classifyFindings } from "./report-taxonomy"
export type { ReviewInput, ReviewSidecar, ReviewSidecarDimension } from "./report-types"
export { ADVISORY_NOTICE, REVIEW_SIDECAR_VERSION } from "./report-types"
