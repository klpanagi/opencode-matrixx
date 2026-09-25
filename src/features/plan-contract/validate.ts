/**
 * Plan Contract — Validator (content-string only; no file I/O).
 *
 * "warn" (DEFAULT) reports drift as advisory warnings; `ok` is true unless
 * hard `errors` exist. "fail" is OPT-IN ONLY and is NOT enabled by default.
 * Task-line regexes come from mission-state (never re-declared).
 */
import {
  MAX_PLAN_FILE_BYTES,
  NUMBERED_CHECKED_RE,
  NUMBERED_UNCHECKED_RE,
  TOP_CHECKED_RE,
  TOP_UNCHECKED_RE,
} from "../../features/mission-state/constants"
import { countPlanProgressFromContent } from "../../features/mission-state/storage"
import { computeLineHash } from "../../tools/hashline-edit/hash-computation"
import { findAppendixStart } from "./appendix"
import { CANONICAL_SECTIONS, REQUIRED_TASK_SUBFIELDS } from "./constants"
import type { PlanContract } from "./schema"
import type { PlanContractResult, PlanContractWarning, PlanTask } from "./types"

const H2_RE = /^##\s+(.+)$/
const DOD_HEADING_RE = /^#{2,4}\s+Definition of Done\s*$/i
const MANDATORY_SUFFIX_RE = /\s*\(MANDATORY\)\s*$/i
const TASK_NUMBER_RE = /\d+/
const SIZE_CAP_RATIO = 0.9

/** Optional caller-supplied LINE#ID anchors keyed by 1-based line number. */
export type HashlineAnchors = ReadonlyMap<number, string> | Readonly<Record<number, string>>

interface Heading {
  normalized: string
  line: number
  index: number
}

function normalizeSectionTitle(title: string): string {
  return title.trim().replace(MANDATORY_SUFFIX_RE, "").trim()
}

/** Tolerant `**<Label>**` + optional `(...)` + optional closing `**:` matcher. */
function buildSubfieldRe(label: string): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`^\\s*\\*\\*\\s*${escaped}(?:\\s*\\([^)]*\\))?\\s*\\*?\\*?\\s*:?`, "i")
}

function resolveAnchor(line: number, raw: string, anchors?: HashlineAnchors): string {
  if (anchors) {
    const map = anchors as ReadonlyMap<number, string>
    const supplied = typeof map.get === "function" ? map.get(line) : (anchors as Record<number, string>)[line]
    if (supplied) return supplied
  }
  return `${line}#${computeLineHash(line, raw)}`
}

export function parsePlanTasks(content: string, hashlineAnchors?: HashlineAnchors): PlanTask[] {
  const tasks: PlanTask[] = []
  const lines = content.split("\n")
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index] ?? ""
    const checked = raw.match(NUMBERED_CHECKED_RE)
    const prefix = checked?.[0] ?? raw.match(NUMBERED_UNCHECKED_RE)?.[0]
    if (!prefix) continue
    const numberText = TASK_NUMBER_RE.exec(prefix)?.[0]
    if (!numberText) continue
    const line = index + 1
    tasks.push({
      n: Number.parseInt(numberText, 10),
      title: raw.slice(prefix.length).trim(),
      checked: checked !== null,
      line,
      anchor: resolveAnchor(line, raw, hashlineAnchors),
    })
  }
  return tasks
}
function collectHeadings(lines: string[]): Heading[] {
  const headings: Heading[] = []
  for (let index = 0; index < lines.length; index++) {
    const match = H2_RE.exec(lines[index] ?? "")
    if (match) headings.push({ normalized: normalizeSectionTitle(match[1]), line: index + 1, index })
  }
  return headings
}
function parseDefinitionOfDone(lines: string[]): string[] {
  const dod: string[] = []
  let inside = false
  for (const line of lines) {
    if (DOD_HEADING_RE.test(line)) {
      inside = true
      continue
    }
    if (inside && /^#{1,4}\s/.test(line)) break
    if (!inside) continue
    const match = line.match(TOP_CHECKED_RE) ?? line.match(TOP_UNCHECKED_RE)
    if (match) dod.push(line.slice(match[0].length).trim())
  }
  return dod
}
export function parsePlanContract(content: string): PlanContract {
  const lines = content.split("\n")
  return {
    sections: collectHeadings(lines).map((heading) => heading.normalized),
    tasks: parsePlanTasks(content),
    dod: parseDefinitionOfDone(lines),
  }
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

export function validatePlanContract(
  content: string,
  options: { mode?: "warn" | "fail" } = {},
): PlanContractResult {
  const mode = options.mode ?? "warn"
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

  if (content.length > MAX_PLAN_FILE_BYTES * SIZE_CAP_RATIO) {
    warnings.push({
      code: "approaching_size_cap",
      message: `Plan is at ${content.length}/${MAX_PLAN_FILE_BYTES} bytes (advisory)`,
    })
  }

  if (mode === "fail") {
    const promoted = warnings.map((warning) => `${warning.code}: ${warning.message}`)
    return { ok: errors.length === 0 && promoted.length === 0, warnings: [], errors: [...errors, ...promoted] }
  }
  return { ok: errors.length === 0, warnings, errors }
}
