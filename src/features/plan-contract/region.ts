/**
 * Plan Contract — named-region primitive.
 *
 * A "region" is a contiguous run of lines introduced by a heading and closed
 * by the next heading of the SAME OR SHALLOWER level. This is the one place in
 * `src/` that knows how to bound such a run; `validate.ts` (via `appendix.ts`)
 * and `src/tools/plan/section-index.ts` are both consumers of it, so a plan
 * cannot end up with two disagreeing notions of "region".
 *
 * INDEX CONVENTION: `startIndex` is 1-BASED and INCLUSIVE (the heading's own
 * line number). `endIndex` is EXCLUSIVE — the 1-based line number of the next
 * heading at level <= the region's own level, or `lines.length + 1` at EOF.
 * A region therefore owns `[startIndex, endIndex)`. This is deliberately the
 * SAME convention as `PlanSectionIndexEntry.endLine` in `src/tools/plan/types.ts`
 * (documented there as "Exclusive") so the two can be compared without a
 * conversion step; `findAppendixStart` converts to a 0-BASED index at its own
 * boundary, which is the only place that conversion exists.
 *
 * DEPENDENCY DIRECTION IS ONE-WAY: consumers (the section index) import this
 * module; this module imports NOTHING from the section registry. That is
 * load-bearing. The registry exists so a heading miss can degrade to
 * `kind:"custom"`, and a region locator exists so a span can be bounded — if
 * the locator needed registry knowledge, then locating a region could fail the
 * way a registry lookup fails, and the validator would be one registry change
 * away from erroring on a perfectly well-formed plan. The registry must never
 * interact with the validator; the arrow points from the registry's consumers
 * toward the registry, never back into a primitive the validator depends on.
 *
 * Heading text is read from the ORIGINAL line, never from a re-serialized
 * markdown AST: `mdast-util-to-markdown` is lossy (renumbers lists, reflows
 * emphasis, drops entity escaping), so a round-tripped heading would not match
 * the text the user actually wrote.
 */

/** Markdown heading depth this primitive can bound. H4+ is not a region root. */
export type RegionLevel = 2 | 3

/**
 * A bounded region of a plan. `startIndex` is inclusive, `endIndex` is
 * exclusive; see the module header for the full convention.
 */
export interface NamedRegion {
  /** Heading depth of the region's opening heading. */
  level: RegionLevel
  /** Heading text exactly as it appears in the plan (trailing space trimmed). */
  text: string
  /** 1-BASED, INCLUSIVE line number of the opening heading. */
  startIndex: number
  /** EXCLUSIVE 1-based line number: the closing heading, or lines.length + 1. */
  endIndex: number
}

/** What a caller sees when deciding whether a heading opens the region it wants. */
export type RegionStart = Omit<NamedRegion, "endIndex">

export type RegionStartPredicate = (heading: RegionStart) => boolean

/** Matches an H2/H3 and captures its marker length and title text. */
const HEADING_RE = /^(#{2,3})\s+(.+?)\s*$/

/**
 * Bound every H2/H3 region in `content`, in document order.
 *
 * This is the shared engine: {@link findNamedRegion} is a filter over it, and
 * `buildSectionIndex` in `src/tools/plan/section-index.ts` maps it onto
 * `PlanSectionIndexEntry`. One scan, one closing rule, no drift.
 */
export function collectNamedRegions(content: string): NamedRegion[] {
  const lines = content.split("\n")
  const starts: RegionStart[] = []
  for (let index = 0; index < lines.length; index++) {
    const match = HEADING_RE.exec(lines[index] ?? "")
    if (!match) continue
    starts.push({
      level: match[1].length as RegionLevel,
      text: match[2],
      startIndex: index + 1,
    })
  }
  // The closing heading is the next one at level <= this heading's level, so
  // this must SCAN FORWARD: an H3 nested in an H2 does not close the H2, and
  // inspecting only the immediate next heading would swallow the subsection.
  return starts.map((start, position) => {
    const closing = starts.slice(position + 1).find((c) => c.level <= start.level)
    return { ...start, endIndex: closing ? closing.startIndex : lines.length + 1 }
  })
}

/**
 * The first H2/H3 region whose opening heading satisfies `predicate`, or `null`
 * when no heading matches. The scan is in document order, so a caller that
 * matches a common word can get an earlier region than it expects — make the
 * predicate specific when that matters.
 */
export function findNamedRegion(
  content: string,
  predicate: RegionStartPredicate,
): NamedRegion | null {
  return collectNamedRegions(content).find((region) => predicate(region)) ?? null
}
