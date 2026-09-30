/// <reference types="bun-types" />
/**
 * Corpus measurement for the Plan B BLOCKING PRECONDITION gate — filesystem-free.
 *
 * WHY THIS IS ITS OWN MODULE: `measurePlans` takes plan CONTENT, never a
 * directory. The gate must be provable from committed fixtures, and
 * `.matrixx/plans/` is a gitignored working directory that a fresh CI checkout
 * does not have. Measuring a directory made the gate green only on the machine
 * that wrote the corpus, which is not a gate.
 *
 * `precondition-gate.ts` keeps `measureCorpus` as a thin directory reader that
 * delegates here, so nothing is implemented twice.
 *
 * NOTHING IS REIMPLEMENTED: heading spans follow the same level-boundary rule
 * `buildSectionIndex` uses and resolution is delegated to
 * `resolveSectionSelector` (the shipped registry). This module only COUNTS.
 */
import {
  type SectionRegistryEntry,
  resolveSectionSelector,
} from "../../../src/features/plan-contract/section-registry"
/** The three H3s Plan B's rubric reads (dimensions 2, 5, 7). */
export const RUBRIC_H3_SELECTORS = [
  "Must NOT Have (Guardrails)",
  "Concrete Deliverables",
  "Test Decision",
] as const

/**
 * The canonical registry ids those three selectors resolve to.
 *
 * Buckets are keyed on these ids, NOT on the selector strings. A plan spells
 * these headings inconsistently — real plans carry "Must NOT Have
 * (Guardrails)", "(guardrails)" and "Must NOT have (guardrails)" — and the
 * registry's normalizer is case-insensitive precisely to absorb that drift.
 * Bucketing by raw heading text would under-count exactly the drift tolerance
 * the registry exists to provide, and would do so silently.
 */
export const RUBRIC_H3_IDS = [
  "must-not-have-guardrails",
  "concrete-deliverables",
  "test-decision",
] as const

/** One plan's content plus the name it is bucketed under. */
export interface PlanSource {
  name: string
  content: string
}

/** Per-selector corpus measurements, keyed by canonical registry id. */
export interface SelectorCorpusStats {
  /** Distinct plans where a heading resolved to this id. */
  resolvedPlans: number
  /** Of those, how many have a non-empty body below the heading. */
  resolvedNonEmpty: number
  /** Plans where the heading exists but the registry had no entry (`custom`). */
  customPlans: number
  /** `ambiguous` resolutions — always a finding, never tolerated. */
  ambiguous: number
}

export interface CorpusStats {
  planCount: number
  bySelector: Record<string, SelectorCorpusStats>
  /** Every H3 heading in the corpus. */
  h3Total: number
  /** H3 headings the registry resolves. */
  h3Resolved: number
  /** H3 headings that fall through to the `custom` escape hatch. */
  h3Custom: number
  /** Every H2 heading in the corpus. */
  h2Total: number
  h2Resolved: number
}

/** Per-plan working set, so one plan counts at most once per selector. */
interface SelectorSets {
  resolved: Set<string>
  resolvedNonEmpty: Set<string>
  custom: Set<string>
  ambiguous: number
}

/** Heading depth, or null when the line is not a `#{2,3}` heading. */
function headingOf(line: string): { level: 2 | 3; text: string } | null {
  const match = /^(#{2,3})\s+(.+?)\s*$/.exec(line)
  if (!match) return null
  return { level: match[1].length as 2 | 3, text: match[2] }
}

/**
 * Read a plan's H2/H3 headings and, for each, the body lines that follow it up
 * to the next heading of level <= its own (the level-boundary rule
 * `buildSectionIndex` uses).
 */
function readHeadings(content: string): { level: 2 | 3; text: string; body: string }[] {
  const lines = content.split("\n")
  const out: { level: 2 | 3; text: string; body: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const heading = headingOf(lines[i])
    if (!heading) continue
    let end = lines.length
    for (let j = i + 1; j < lines.length; j++) {
      const next = headingOf(lines[j])
      if (next && next.level <= heading.level) {
        end = j
        break
      }
    }
    out.push({ ...heading, body: lines.slice(i + 1, end).join("\n").trim() })
  }
  return out
}

function emptySelectorStats(): SelectorCorpusStats {
  return { resolvedPlans: 0, resolvedNonEmpty: 0, customPlans: 0, ambiguous: 0 }
}

function emptySelectorSets(): Record<string, SelectorSets> {
  return Object.fromEntries(
    RUBRIC_H3_IDS.map((id) => [
      id,
      { resolved: new Set<string>(), resolvedNonEmpty: new Set<string>(), custom: new Set<string>(), ambiguous: 0 },
    ]),
  )
}

function freezeSelectorStats(sets: Record<string, SelectorSets>): Record<string, SelectorCorpusStats> {
  return Object.fromEntries(
    Object.entries(sets).map(([id, bucket]) => [
      id,
      {
        resolvedPlans: bucket.resolved.size,
        resolvedNonEmpty: bucket.resolvedNonEmpty.size,
        customPlans: bucket.custom.size,
        ambiguous: bucket.ambiguous,
      },
    ]),
  )
}

/**
 * Measure a set of plans. `entries` defaults to the shipped
 * `PLAN_SECTION_REGISTRY`; the NEGATIVE scenario passes an empty registry to
 * simulate the registry being absent.
 */
export function measurePlans(
  plans: readonly PlanSource[],
  entries?: readonly SectionRegistryEntry[],
): CorpusStats {
  const stats: CorpusStats = {
    planCount: 0,
    bySelector: Object.fromEntries(RUBRIC_H3_IDS.map((id) => [id, emptySelectorStats()])),
    h3Total: 0,
    h3Resolved: 0,
    h3Custom: 0,
    h2Total: 0,
    h2Resolved: 0,
  }
  const perPlan = emptySelectorSets()
  for (const plan of [...plans].sort((a, b) => a.name.localeCompare(b.name))) {
    stats.planCount += 1
    for (const heading of readHeadings(plan.content)) {
      const resolution = resolveSectionSelector(heading.text, entries)
      const resolved = resolution.kind === "resolved"
      if (heading.level === 3) {
        stats.h3Total += 1
        if (resolved) stats.h3Resolved += 1
        else stats.h3Custom += 1
      } else {
        stats.h2Total += 1
        if (resolved) stats.h2Resolved += 1
      }
      // Keyed on the RESOLVED id, not the heading text, so a plan that spells
      // the section differently still counts as resolving it.
      const id =
        resolution.kind === "resolved"
          ? resolution.entry.id
          : resolution.kind === "custom"
            ? resolution.id
            : resolution.key
      const bucket = perPlan[id]
      if (!bucket) continue
      if (resolution.kind === "ambiguous") {
        bucket.ambiguous += 1
      } else if (resolved) {
        bucket.resolved.add(plan.name)
        if (heading.body.length > 0) bucket.resolvedNonEmpty.add(plan.name)
      } else {
        bucket.custom.add(plan.name)
      }
    }
  }
  stats.bySelector = freezeSelectorStats(perPlan)
  return stats
}
