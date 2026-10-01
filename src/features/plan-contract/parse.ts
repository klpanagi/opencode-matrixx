/**
 * Plan Contract — Parsing (content-string only; no file I/O).
 *
 * Extracted from `validate.ts` so the validator stays under the 200-LOC ceiling
 * while gaining the schema gate and the section-level size attribution.
 *
 * WHAT LIVES HERE: heading collection, numbered-task parsing, the definition of
 * Done scan, the assembled {@link PlanContract}, and the byte attribution that
 * turns `approaching_size_cap` from a bare number into "this section is the one
 * to trim". `validate.ts` owns the ADVISORY policy; this module owns the FACTS.
 *
 * The `mode:"fail"` branch that once lived in the validator is gone for good
 * (see `validatePlanContract`), and nothing here reintroduces a blocking path.
 */
import {
  MAX_PLAN_FILE_BYTES,
  measurePlanBytes,
  NUMBERED_CHECKED_RE,
  NUMBERED_UNCHECKED_RE,
  TOP_CHECKED_RE,
  TOP_UNCHECKED_RE,
} from "../../features/mission-state/constants"
import { computeLineHash } from "../../tools/hashline-edit/hash-computation"
import { parsePlanFrontMatter } from "./front-matter"
import { collectNamedRegions } from "./region"
import type { PlanContract } from "./schema"
import type { PlanTask } from "./types"

const H2_RE = /^##\s+(.+)$/
const DOD_HEADING_RE = /^#{2,4}\s+Definition of Done\s*$/i
const MANDATORY_SUFFIX_RE = /\s*\(MANDATORY\)\s*$/i
const TASK_NUMBER_RE = /\d+/

/** Fraction of the cap at which the advisory fires. Unchanged. */
const SIZE_CAP_RATIO = 0.9

/** Optional caller-supplied LINE#ID anchors keyed by 1-based line number. */
export type HashlineAnchors = ReadonlyMap<number, string> | Readonly<Record<number, string>>

export interface Heading {
  normalized: string
  line: number
  index: number
}

export function normalizeSectionTitle(title: string): string {
  return title.trim().replace(MANDATORY_SUFFIX_RE, "").trim()
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

export function collectHeadings(lines: string[]): Heading[] {
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

/**
 * Assemble the structured view of a plan.
 *
 * `frontMatter` is populated from the leading YAML block via the SINGLE
 * {@link parsePlanFrontMatter} implementation, so the declared
 * {@link PlanContract} type and the runtime shape agree. A plan without a block
 * (or with a malformed one) yields `undefined`, never a synthesized default.
 */
export function parsePlanContract(content: string): PlanContract {
  const lines = content.split("\n")
  return {
    frontMatter: parsePlanFrontMatter(content) ?? undefined,
    sections: collectHeadings(lines).map((heading) => heading.normalized),
    tasks: parsePlanTasks(content),
    dod: parseDefinitionOfDone(lines),
  }
}

/**
 * The largest TOP-LEVEL (H2) region in `content`, by {@link measurePlanBytes},
 * or `null` when the plan has no H2 at all.
 *
 * Reuses `collectNamedRegions` — the same primitive the section index uses — so
 * "where does a section end" cannot drift between the two. Bytes go through the
 * one ruler (`measurePlanBytes`), never a raw `.length`.
 *
 * This is what makes the size-cap advisory ACTIONABLE: the total alone says
 * "too big", the top-level region says "trim THIS one".
 */
export function largestSection(content: string): { text: string; bytes: number } | null {
  const lines = content.split("\n")
  let largest: { text: string; bytes: number } | null = null
  for (const region of collectNamedRegions(content)) {
    if (region.level !== 2) continue
    const span = lines.slice(region.startIndex - 1, region.endIndex - 1).join("\n")
    const bytes = measurePlanBytes(span)
    if (largest === null || bytes > largest.bytes) largest = { text: region.text, bytes }
  }
  return largest
}

/** True when `content` is at or beyond the advisory size threshold. */
export function isApproachingSizeCap(content: string, cap: number = MAX_PLAN_FILE_BYTES): boolean {
  return measurePlanBytes(content) > cap * SIZE_CAP_RATIO
}
