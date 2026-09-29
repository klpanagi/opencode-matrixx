/**
 * Plan Contract — Validator (content-string only; no file I/O).
 *
 * Always warn-only: drift is reported as advisory warnings and `ok` stays true
 * unless a hard `error` exists. There is no fail mode — see validatePlanContract.
 * Task-line regexes come from mission-state (never re-declared).
 *
 * PARSING LIVES IN `./parse`. This file is the ADVISORY POLICY over the facts
 * the parser produces; it is the only place allowed to decide `ok` is false.
 */
import { MAX_PLAN_FILE_BYTES, measurePlanBytes } from "../../features/mission-state/constants"
import { countPlanProgressFromContent } from "../../features/mission-state/storage"
import { findAppendixStart } from "./appendix"
import { CANONICAL_SECTIONS, REQUIRED_TASK_SUBFIELDS } from "./constants"
import {
  collectHeadings,
  type Heading,
  isApproachingSizeCap,
  largestSection,
  normalizeSectionTitle,
  parsePlanContract,
  parsePlanTasks,
} from "./parse"
import { PlanContractSchema } from "./schema"
import type { PlanContractResult, PlanContractWarning, PlanTask } from "./types"

export type { HashlineAnchors, Heading } from "./parse"
// Re-exported so this module's public surface is unchanged by the extraction.
export { collectHeadings, normalizeSectionTitle, parsePlanContract, parsePlanTasks } from "./parse"

/** Tolerant `**<Label>**` + optional `(...)` + optional closing `**:` matcher. */
function buildSubfieldRe(label: string): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`^\\s*\\*\\*\\s*${escaped}(?:\\s*\\([^)]*\\))?\\s*\\*?\\*?\\s*:?`, "i")
}

function appendMissingSubfieldWarnings(
  lines: string[],
  tasks: PlanTask[],
  headings: Heading[],
  warnings: PlanContractWarning[],
): void {
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    if (!task) continue
    const start = task.line - 1
    let end = lines.length
    const nextTask = tasks[i + 1]
    if (nextTask) end = Math.min(end, nextTask.line - 1)
    const nextHeading = headings.find((heading) => heading.index > start)
    if (nextHeading) end = Math.min(end, nextHeading.index)
    const body = lines.slice(start + 1, end)
    for (const label of REQUIRED_TASK_SUBFIELDS) {
      const re = buildSubfieldRe(label)
      if (!body.some((line) => re.test(line))) {
        warnings.push({
          code: "missing_subfield",
          message: `Task ${task.n} is missing required subfield "**${label}**"`,
          line: task.line,
        })
      }
    }
  }
}

/**
 * A `PlanContractSchema` mismatch is ADVISORY. The schema describes what the
 * parser produces; a mismatch is a diagnostic about this code, never grounds
 * for rejecting a plan a user wrote. `ok` is computed from `errors` alone.
 */
function pushSchemaWarnings(content: string, warnings: PlanContractWarning[]): void {
  const result = PlanContractSchema.safeParse(parsePlanContract(content))
  if (result.success) return
  for (const issue of result.error.issues) {
    warnings.push({
      code: "contract_schema_mismatch",
      message: `Parsed contract violates PlanContractSchema at ${issue.path.join(".") || "<root>"}: ${issue.message}`,
    })
  }
}

/**
 * The size advisory, attributed to the section to trim.
 *
 * A bare byte total says "too big"; the per-section breakdown says WHICH
 * section. `largestSection` walks the same `collectNamedRegions` primitive the
 * section index uses, so the two cannot disagree about where a section ends.
 */
function buildSizeCapWarning(content: string): PlanContractWarning {
  const planBytes = measurePlanBytes(content)
  const largest = largestSection(content)
  const attribution = largest
    ? ` Largest top-level section: "## ${largest.text}" (${largest.bytes} bytes).`
    : ""
  return {
    code: "approaching_size_cap",
    message: `Plan is at ${planBytes}/${MAX_PLAN_FILE_BYTES} bytes (advisory).${attribution}`,
  }
}

/**
 * Validate plan content against the canonical section contract.
 *
 * PERMANENTLY ADVISORY: section findings are warnings and never block. A
 * hard-fail mode was removed deliberately — it would turn authoring guidance
 * into a rejection and invite edit-retry loops over plans that were never
 * wrong. Do not reintroduce it; `errors` is reserved for empty content.
 */
export function validatePlanContract(content: string): PlanContractResult {
  const warnings: PlanContractWarning[] = []
  const errors: string[] = []
  if (content.trim().length === 0) errors.push("Plan content is empty")
  const lines = content.split("\n")
  const headings = collectHeadings(lines)
  const appendixIndex = findAppendixStart(content)
  const visible = headings.filter((heading) => appendixIndex === -1 || heading.index < appendixIndex)
  const canonical = CANONICAL_SECTIONS.map(normalizeSectionTitle)

  for (const section of CANONICAL_SECTIONS) {
    const normalized = normalizeSectionTitle(section)
    if (!visible.some((heading) => heading.normalized === normalized)) {
      warnings.push({ code: "missing_section", message: `Missing canonical section "## ${section}"` })
    }
  }

  let lastCanonicalIndex = -1
  for (const heading of visible) {
    const canonicalIndex = canonical.indexOf(heading.normalized)
    if (canonicalIndex === -1) {
      warnings.push({
        code: "unknown_top_level_section",
        message: `Unknown top-level section "## ${heading.normalized}"`,
        line: heading.line,
      })
      continue
    }
    if (canonicalIndex < lastCanonicalIndex) {
      warnings.push({
        code: "section_out_of_order",
        message: `Section "## ${heading.normalized}" appears out of canonical order`,
        line: heading.line,
      })
    }
    lastCanonicalIndex = canonicalIndex
  }

  const tasks = parsePlanTasks(content)
  const progress = countPlanProgressFromContent(content)
  if (progress.needsTriage || tasks.length === 0) {
    warnings.push({ code: "no_numbered_tasks", message: "Plan has no numbered tasks; it needs triage" })
  }
  appendMissingSubfieldWarnings(lines, tasks, headings, warnings)


  if (isApproachingSizeCap(content)) {
    warnings.push(buildSizeCapWarning(content))
  }
  pushSchemaWarnings(content, warnings)

  return { ok: errors.length === 0, warnings, errors }
}
