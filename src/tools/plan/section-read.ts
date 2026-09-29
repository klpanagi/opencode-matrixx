/**
 * Section-scoped `plan_read` resolution (Task 9).
 *
 * SEPARATED FROM `plan-read.ts` deliberately: that file is close to the 200-LOC
 * ceiling and the cutover task still has to land a cap bypass in it. The section
 * selector is a self-contained concern (resolve selector -> span -> payload) with
 * its own precedence and degradation rules, so it lives here.
 *
 * SPAN DISCIPLINE — the budget defended here is CONTEXT, not I/O. Locating a
 * heading legitimately scans the body: `buildSectionIndex` walks every line to
 * find heading boundaries, and `buildOutline` below scans the line array too.
 * That work is unavoidable and stays inside this process. What is forbidden is
 * RENDERING it: the payload built below is assembled from
 * `lines.slice(startLine - 1, endLine - 1)` ONLY, and the emitted outline is
 * filtered down to entries inside that slice. The whole-file concatenation
 * happens in `readPlanFile` (which every read path already performs) and nowhere
 * in the result builder.
 *
 * ORIGINAL TEXT ONLY: a section span is a slice of the source lines. A parsed
 * markdown AST is never re-stringified here — `mdast-util-to-markdown` is lossy
 * (renumbers lists, reflows emphasis), so a round-tripped span would not be the
 * file's bytes and every byte count, `contentHash` and absolute anchor derived
 * from it would describe a document that never existed on disk.
 *
 * PRECEDENCE: `section` WINS over `offset`/`limit`. When both are supplied the
 * section defines the base span and the response reports
 * `precedence: "section"` plus the effective absolute `startLine`/`endLine`, so
 * the conflict is never silent.
 */
import { measurePlanBytes } from "../../features/mission-state/constants"
import { classifyPlanLifecycle } from "../../features/plan-contract/lifecycle"
import { resolveSectionSelector } from "../../features/plan-contract/section-registry"
import { formatHashLine } from "../hashline-edit/hash-computation"
import { MAX_PLAN_READ_RENDERED_BYTES } from "./constants"
import { PLAN_ERROR_CODES } from "./error-codes"
import { buildOutline, buildSectionIndex } from "./section-index"
import type { PlanReadFormat, PlanSectionIndexEntry } from "./types"

const SECTION_HINT = "Section is larger than the rendered cap — retry plan_read with the same section plus offset/limit scoped to that section, or plan_tasks for the manifest"

type SectionOutcome =
  | { kind: "error"; body: Record<string, unknown> }
  | { kind: "ok"; body: Record<string, unknown> }

/** Metadata a caller needs to address the section again (and gate staleness on). */
function sectionMetadata(entry: PlanSectionIndexEntry): Record<string, unknown> {
  return {
    id: entry.id,
    level: entry.level,
    headingText: entry.headingText,
    startLine: entry.startLine,
    endLine: entry.endLine,
    bytes: entry.bytes,
    contentHash: entry.contentHash,
  }
}

function errorBody(code: string, message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { error: code, message, ...extra }
}

/** Stable, de-duplicated list of the ids this file actually has. */
function availableIds(entries: PlanSectionIndexEntry[]): string {
  return [...new Set(entries.map((entry) => entry.id))].join(", ")
}

/**
 * Resolve a selector to exactly ONE index entry, failing closed on duplicates.
 *
 * The registry is consulted only to learn the selector's canonical id (and to
 * reject a genuinely ambiguous REGISTRY selector). Occurrence disambiguation
 * happens against the file's own index, because the same H3 can appear many
 * times in one plan — `### Agent-Executed QA Scenarios` appears 15 times across
 * the corpus — and picking the first match silently would make the read
 * non-deterministic.
 */
function locateEntry(
  entries: PlanSectionIndexEntry[],
  selector: string,
  sectionIndex: number | undefined,
): { entry: PlanSectionIndexEntry } | { failure: Record<string, unknown> } {
  const resolution = resolveSectionSelector(selector)
  if (resolution.kind === "ambiguous") {
    return { failure: errorBody(PLAN_ERROR_CODES.sectionAmbiguous, resolution.message, { selector }) }
  }
  const id = resolution.kind === "resolved" ? resolution.entry.id : resolution.id
  const occurrences = entries.filter((entry) => entry.id === id)
  if (occurrences.length === 0) {
    return {
      failure: errorBody(
        PLAN_ERROR_CODES.sectionNotFound,
        `Section "${selector}" resolves to no heading in this plan. Available sections: ${availableIds(entries)}`,
        { selector },
      ),
    }
  }
  if (occurrences.length === 1) return { entry: occurrences[0] }
  const range = `0-${occurrences.length - 1}`
  if (sectionIndex === undefined) {
    return {
      failure: errorBody(
        PLAN_ERROR_CODES.validationError,
        `section "${selector}" occurs ${occurrences.length} times in this plan — pass sectionIndex (0-based, valid range ${range}) to choose one occurrence`,
        { argument: "section" },
      ),
    }
  }
  const occurrence = occurrences[sectionIndex]
  if (!occurrence) {
    return {
      failure: errorBody(
        PLAN_ERROR_CODES.validationError,
        `sectionIndex ${sectionIndex} is out of range for section "${selector}" — valid sectionIndex values are ${range}`,
        { argument: "sectionIndex" },
      ),
    }
  }
  return { entry: occurrence }
}

/** Outline restricted to the section: `buildOutline` over the source lines, filtered. */
function sectionOutline(lines: string[], entry: PlanSectionIndexEntry) {
  return buildOutline(lines).filter((item) => item.line >= entry.startLine && item.line < entry.endLine)
}

export interface SectionReadRequest {
  filePath: string
  content: string
  lines: string[]
  format: PlanReadFormat
  selector: string
  sectionIndex: number | undefined
  /** True when `offset`/`limit` were also supplied — reported as `precedence`. */
  paginated: boolean
}

/**
 * Build the `plan_read` response for a section read. Returns a JSON-ready object
 * so the caller keeps a single stringify site.
 */
export function readSection(request: SectionReadRequest): SectionOutcome {
  const entries = buildSectionIndex(request.content)
  const located = locateEntry(entries, request.selector, request.sectionIndex)
  if ("failure" in located) return { kind: "error", body: located.failure }
  const entry = located.entry
  // The ONLY lines that reach the payload: an inclusive/exclusive slice of the
  // source array. Nothing else is rendered for a section read.
  const span = request.lines.slice(entry.startLine - 1, entry.endLine - 1)
  const section = sectionMetadata(entry)
  const base = {
    filePath: request.filePath,
    section,
    startLine: entry.startLine,
    endLine: entry.endLine,
    ...(request.paginated ? { precedence: "section" } : {}),
    lifecycle: classifyPlanLifecycle(request.filePath, request.content),
  }
  const payload =
    request.format === "content"
      ? { ...base, content: span.join("\n") }
      : { ...base, hashline: span.map((line, index) => formatHashLine(entry.startLine + index, line)).join("\n") }
  if (measurePlanBytes(JSON.stringify(payload)) > MAX_PLAN_READ_RENDERED_BYTES) {
    return {
      kind: "ok",
      body: { ...base, truncated: true, outline: sectionOutline(request.lines, entry), hint: SECTION_HINT },
    }
  }
  return { kind: "ok", body: payload }
}
