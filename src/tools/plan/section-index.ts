/**
 * Plan Section Index (Task 5).
 *
 * A byte-accounted index over a plan file's sections. Per section it reports
 * `{ id, level, headingText, startLine, endLine, bytes, contentHash }`.
 *
 * `endLine` is EXCLUSIVE: the section owns lines `[startLine, endLine)`. So
 * `endLine` is the 1-based line number of the next heading whose level is <=
 * this section's own level, or `lines.length + 1` at EOF. An H3 therefore ends
 * at the next H3 *or* the next H2, whichever comes first — the boundary is
 * level-based, not depth-based.
 *
 * NESTING: an H3 lives INSIDE its parent H2's span, so `bytes` OVERLAPS between
 * a parent and its children. Byte reconciliation against a file size must
 * therefore sum TOP-LEVEL (level 2) entries only — summing every entry
 * double-counts each subsection. This is a property of the document, not a
 * rounding artifact.
 *
 * BYTE RULER: every `bytes` value goes through `measurePlanBytes` from
 * `src/features/mission-state/constants` — the SINGLE byte ruler Wave 1
 * established. Never call a raw `Buffer.byteLength` here: a second ruler is how
 * a `.length`-vs-bytes desync (CJK/emoji undercounting 3x) comes back.
 *
 * NEVER re-stringify a parsed markdown AST. `mdast-util-to-markdown` is lossy
 * by design (renumbers lists, reflows emphasis, drops entity escaping), so a
 * round-tripped span would not be the file's bytes and every byte count and
 * contentHash derived from it would describe a document that never existed on
 * disk. All spans below are slices of the ORIGINAL text.
 *
 * `contentHash` is `Bun.hash.xxHash64` over `id + startLine + span text` —
 * 64 bits, 16 hex digits. The `startLine` term is deliberate and load-bearing:
 * it makes the hash position-sensitive, which is what lets an edit to section A
 * leave section B's hash BYTE-IDENTICAL. A content-only hash cannot satisfy
 * that DoD line. The per-line `computeLineHash` in `hashline-edit` is
 * deliberately NOT reused for this — it is ONE character wide (~1/256
 * collision), a display affordance rather than an integrity check.
 */
import {
  measurePlanBytes,
  NUMBERED_CHECKED_RE,
  NUMBERED_UNCHECKED_RE,
} from "../../features/mission-state/constants"
import {
  collectNamedRegions,
  type NamedRegion,
} from "../../features/plan-contract/region"
import { normalizeSectionKey } from "../../features/plan-contract/section-registry"
import { computeLineHash } from "../hashline-edit/hash-computation"
import type { PlanOutlineEntry, PlanSectionIndexEntry } from "./types"

const H2_LINE_RE = /^##\s+(.+)$/

/** Title of a numbered Oracle task on `line`, or null. See {@link buildOutline}. */
function matchNumberedTaskTitle(line: string): string | null {
  // The authoritative patterns are /gm and therefore stateful — reset before use.
  NUMBERED_CHECKED_RE.lastIndex = 0
  NUMBERED_UNCHECKED_RE.lastIndex = 0
  const checked = NUMBERED_CHECKED_RE.exec(line)
  const prefix = checked?.[0] ?? NUMBERED_UNCHECKED_RE.exec(line)?.[0]
  return prefix ? line.slice(prefix.length).trim() : null
}

/** 64-bit position-sensitive hash; lowercase hex, exactly 16 digits. */
export function computeSectionHash(id: string, startLine: number, span: string): string {
  return Bun.hash.xxHash64(`${id} ${startLine} ${span}`).toString(16).padStart(16, "0")
}

/** The section's exact original text span, trailing newline included when present. */
export function readSectionSpan(lines: string[], entry: PlanSectionIndexEntry): string {
  const body = lines.slice(entry.startLine - 1, entry.endLine - 1).join("\n")
  return entry.endLine - 1 < lines.length ? `${body}\n` : body
}

/**
 * SHARED with `validate.ts`, not re-derived here: `collectNamedRegions` in
 * `src/features/plan-contract/region.ts` is the single implementation of the
 * "closes at the next heading of level <= own level" rule, so the section
 * index and the appendix exclusion cannot drift apart on where a section ends.
 * `region.ts` uses the identical `^(#{2,3})\s+(.+?)\s*$` capture that
 * `extractHeadingText` used here, so heading text is unchanged.
 *
 * The dependency arrow points ONE WAY: this file imports the primitive, and
 * `region.ts` imports nothing from the registry. `normalizeSectionKey` is
 * still applied HERE, at the consumer — the locator must stay ignorant of
 * registry identity so that a registry miss can never turn a span lookup into
 * a failure.
 */
function collectHeadings(content: string): NamedRegion[] {
  return collectNamedRegions(content)
}

/**
 * Build the byte-accounted section index. Anything before the first H2/H3 (the
 * document title, the preamble) is NOT a section and is excluded — callers
 * account for it separately as front matter when reconciling bytes.
 */
export function buildSectionIndex(content: string): PlanSectionIndexEntry[] {
  const lines = content.split("\n")
  return collectHeadings(content).map((heading) => {
    const entry: PlanSectionIndexEntry = {
      id: normalizeSectionKey(heading.text),
      level: heading.level,
      headingText: heading.text,
      startLine: heading.startIndex,
      endLine: heading.endIndex,
      bytes: 0,
      contentHash: "",
    }
    const span = readSectionSpan(lines, entry)
    entry.bytes = measurePlanBytes(span)
    entry.contentHash = computeSectionHash(entry.id, entry.startLine, span)
    return entry
  })
}

/**
 * Legacy truncation outline, moved here out of `plan-read.ts`.
 *
 * The shape is UNCHANGED (`{ level, text, line, anchor }`) because `plan_read`'s
 * `{truncated, outline, hint}` payload is a live contract. Numbered tasks are
 * reported wherever they appear — most of the corpus has no `## TODOs` section
 * (21/35 plans carry zero numbered tasks), so this must not assume one. Task
 * progress stays with `countPlanProgressFromContent`; this is a locator, never
 * a progress authority.
 */
export function buildOutline(lines: string[]): PlanOutlineEntry[] {
  const outline: PlanOutlineEntry[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const lineNumber = index + 1
    const anchor = `${lineNumber}#${computeLineHash(lineNumber, line)}`
    const heading = H2_LINE_RE.exec(line)
    if (heading) {
      outline.push({ level: 2, text: heading[1].trim(), line: lineNumber, anchor })
      continue
    }
    const title = matchNumberedTaskTitle(line)
    if (title !== null) {
      outline.push({ level: 3, text: title, line: lineNumber, anchor })
    }
  }
  return outline
}
