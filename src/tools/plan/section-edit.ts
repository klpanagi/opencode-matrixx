/**
 * Section-scoped WRITE path for `plan_update` (Task 10).
 *
 * WHAT THIS BUYS: `plan_read(section)` hands a caller a `contentHash` for one
 * section. This module turns that hash into a WRITE GATE. The section's line
 * range is re-derived from a FRESH `buildSectionIndex` of the file as it is at
 * write time — line numbers are never persisted, never trusted from the caller,
 * and never carried across calls. An insertion above the target therefore does
 * not invalidate the address; only a change to the section itself does.
 *
 * NEVER re-stringify a parsed markdown AST. `mdast-util-to-markdown` is
 * EXPLICITLY LOSSY (it renumbers lists, reflows emphasis, drops entity
 * escaping), so a production tool must edit the ORIGINAL TEXT SPAN and must
 * NEVER re-stringify a parsed AST. A round-tripped span would not be the file's
 * bytes, and every byte count, hash and anchor derived from it would describe a
 * document that never existed on disk. Every line and every anchor below is read
 * out of the file's own `split("\n")` array and stamped with the same
 * `computeLineHash` the reader used — no serializing step sits in the middle.
 *
 * WHAT IT DOES NOT FIX: the per-line `computeLineHash` is ONE character wide
 * (~1/256 collision) and a `replace` inside a section is still checked against
 * it by the downstream executor. `contentHash` gates the section AS A WHOLE; it
 * does not harden the individual lines within it. Likewise a section id derives
 * from the heading TEXT, so a renamed heading invalidates the id — this plan
 * trades one failure mode (insert drift) for another (rename drift), and a
 * rename fails CLOSED by listing the available ids rather than through an alias.
 *
 * ANCHORING when `pos` is omitted (section-scoped only): `append` inserts after
 * the section's last NON-BLANK line, so a trailing blank separator survives;
 * `prepend` inserts before the section's first BODY line, i.e. directly under
 * the heading — the heading itself is NOT the anchor, because `prepend` inserts
 * BEFORE its anchor and would land above the section it was asked to edit. A
 * heading-only section has no body line to prepend to and is refused, naming
 * `append` as the remedy, rather than silently flipped to the other op.
 * `replace` never defaults — it always requires `pos`, exactly as the whole-file
 * path does.
 */
import { computeLineHash } from "../hashline-edit/hash-computation"
import type { RawHashlineEdit } from "../hashline-edit/normalize-edits"
import { PLAN_ERROR_CODES } from "./error-codes"
import { buildSectionIndex } from "./section-index"
import { locateSectionEntry } from "./section-locate"
import type { PlanSectionIndexEntry } from "./types"

const RE_ANCHOR_LINE = /^(\d+)#/

/** A section-scoped edit, as it arrives on the wire. */
export interface RawSectionEdit extends RawHashlineEdit {
  section?: string
  sectionIndex?: number
  contentHash?: string
}

type Outcome =
  | { kind: "error"; body: Record<string, unknown> }
  | { kind: "ok"; edits: RawHashlineEdit[]; sectionIds: string[] }

function errorBody(error: string, message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { error, message, ...extra }
}

function anchorLineNumber(anchor: string): number | null {
  const match = RE_ANCHOR_LINE.exec(anchor)
  return match ? Number.parseInt(match[1] as string, 10) : null
}

/** `N#ID` exactly as `plan_read`'s hashline payload emitted it. */
function anchorFor(lineNumber: number, line: string): string {
  return `${lineNumber}#${computeLineHash(lineNumber, line)}`
}

/** Last non-blank 1-based line of the section, else its first line. */
function sectionEndLine(lines: string[], entry: PlanSectionIndexEntry): number {
  for (let number = entry.endLine - 1; number > entry.startLine; number -= 1) {
    if ((lines[number - 1] ?? "").trim() !== "") return number
  }
  return entry.startLine
}

/** First line AFTER the heading, or null when the section is a bare heading. */
function sectionFirstBodyLine(entry: PlanSectionIndexEntry): number | null {
  return entry.startLine + 1 < entry.endLine ? entry.startLine + 1 : null
}

function staleBody(selector: string, expected: string, actual: string): Record<string, unknown> {
  return errorBody(
    PLAN_ERROR_CODES.sectionStale,
    `Section "${selector}" changed since it was read — supplied contentHash ${expected}, recomputed ${actual}`,
    {
      selector,
      expectedHash: expected,
      actualHash: actual,
      hint: "Re-read the section with plan_read and retry with the fresh contentHash — the edit was NOT applied",
    },
  )
}

/** A caller-supplied `pos`/`end` must name a line the section actually owns. */
function outsideSpan(
  anchor: string,
  entry: PlanSectionIndexEntry,
  label: string,
  selector: string,
): Record<string, unknown> | null {
  const number = anchorLineNumber(anchor)
  if (number !== null && number >= entry.startLine && number < entry.endLine) return null
  return errorBody(
    PLAN_ERROR_CODES.validationError,
    `${label} anchor ${anchor} is outside section "${selector}" (lines ${entry.startLine}-${entry.endLine - 1})`,
    { argument: label },
  )
}

/** Project the addressing keys away so the downstream normalizer never sees them. */
function toRawEdit(edit: RawSectionEdit): RawHashlineEdit {
  return { op: edit.op, pos: edit.pos, end: edit.end, lines: edit.lines }
}

/** Rewrite one section-scoped edit into an absolute hashline edit. */
function convertEdit(
  edit: RawSectionEdit,
  entry: PlanSectionIndexEntry,
  lines: string[],
  selector: string,
): { ok: true; edit: RawHashlineEdit } | { ok: false; failure: Record<string, unknown> } {
  const op = edit.op
  if (op === "append" || op === "prepend") {
    if (typeof edit.pos === "string" && edit.pos.trim() !== "") {
      const outside = outsideSpan(edit.pos, entry, "pos", selector)
      return outside ? { ok: false, failure: outside } : { ok: true, edit: toRawEdit(edit) }
    }
    if (op === "append") {
      const line = sectionEndLine(lines, entry)
      return { ok: true, edit: { ...toRawEdit(edit), pos: anchorFor(line, lines[line - 1] ?? "") } }
    }
    const first = sectionFirstBodyLine(entry)
    if (first === null) {
      return {
        ok: false,
        failure: errorBody(
          PLAN_ERROR_CODES.validationError,
          `section "${selector}" is a bare heading with no body line to prepend before — use op "append" to add a first line under it`,
          { argument: "op" },
        ),
      }
    }
    return { ok: true, edit: { ...toRawEdit(edit), pos: anchorFor(first, lines[first - 1] ?? "") } }
  }
  // `replace` — `pos` presence is already guaranteed by plan-update's pre-validation.
  const pos = edit.pos ?? ""
  const outside = outsideSpan(pos, entry, "pos", selector)
  if (outside) return { ok: false, failure: outside }
  if (typeof edit.end === "string" && edit.end.trim() !== "") {
    const endOutside = outsideSpan(edit.end, entry, "end", selector)
    if (endOutside) return { ok: false, failure: endOutside }
  }
  return { ok: true, edit: { ...toRawEdit(edit), pos } }
}

/**
 * Resolve every section-scoped edit against ONE fresh parse of `content`, and
 * return the equivalent absolute hashline edits. Edits with no `section` pass
 * through untouched, so a single call may mix both forms.
 */
export function resolveSectionScopedEdits(content: string, rawEdits: RawSectionEdit[]): Outcome {
  const scoped = rawEdits.filter((edit) => typeof edit.section === "string" && edit.section.trim() !== "")
  if (scoped.length === 0) return { kind: "ok", edits: rawEdits, sectionIds: [] }
  const entries = buildSectionIndex(content)
  const lines = content.split("\n")
  const resolved = new Map<RawSectionEdit, RawHashlineEdit>()
  const sectionIds: string[] = []
  for (const edit of scoped) {
    const selector = (edit.section as string).trim()
    const located = locateSectionEntry(entries, selector, edit.sectionIndex)
    if ("failure" in located) return { kind: "error", body: located.failure }
    const { entry } = located
    if (typeof edit.contentHash === "string" && edit.contentHash !== entry.contentHash) {
      return { kind: "error", body: staleBody(selector, edit.contentHash, entry.contentHash) }
    }
    const converted = convertEdit(edit, entry, lines, selector)
    if (!converted.ok) return { kind: "error", body: converted.failure }
    resolved.set(edit, converted.edit)
    if (!sectionIds.includes(entry.id)) sectionIds.push(entry.id)
  }
  return { kind: "ok", edits: rawEdits.map((edit) => resolved.get(edit) ?? edit), sectionIds }
}

/** Post-write section metadata. All hashes are RECOMPUTED from the new text. */
export function sectionWritePayload(content: string, sectionIds: string[]): Record<string, unknown> {
  const entries = buildSectionIndex(content)
  const first = entries.find((entry) => entry.id === sectionIds[0])
  return {
    ...(first ? { section: { ...first } } : {}),
    sections: entries.map((entry) => ({ id: entry.id, startLine: entry.startLine, endLine: entry.endLine, contentHash: entry.contentHash })),
  }
}
