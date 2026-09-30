/// <reference types="bun-types" />
/**
 * Pure corpus/registry helpers for the Plan B BLOCKING PRECONDITION gate
 * (`.matrixx/plans/plan-completion-review.md` Task 1).
 *
 * WHY A SEPARATE MODULE: the positive gate (`precondition.test.ts`) and the
 * NEGATIVE scenario ("run the gate against a plans dir lacking the section
 * registry and assert it FAILS") must evaluate the SAME predicate. A test that
 * only ever runs its own happy path has never failed, so it is not a gate.
 * Both callers import `gateFailures` from here.
 *
 * NOTHING IS REIMPLEMENTED: section resolution is delegated to
 * `resolveSectionSelector` (the shipped registry) and spans to `buildSectionIndex`
 * (the shipped section index). This module only COUNTS and COMPARES.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
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
 * `bySelector` is keyed by these ids, NOT by the selector strings. A plan spells
 * these headings inconsistently — the live corpus carries "Must NOT Have
 * (Guardrails)", "(guardrails)" and "Must NOT have (guardrails)" — and the
 * registry's normalizer is case-insensitive precisely to absorb that drift.
 * Bucketing by raw heading text therefore under-counts exactly the drift
 * tolerance the registry exists to provide, and does so silently.
 */
export const RUBRIC_H3_IDS = [
  "must-not-have-guardrails",
  "concrete-deliverables",
  "test-decision",
] as const

/**
 * Corpus-size floor each rubric H3 must clear.
 *
 * Live corpus (36 plans) resolves 31 / 28 / 27 of the three rubric H3s, so the
 * binding constraint is `test-decision` at 27. The plan text quotes
 * "25/35" for it, which is close but was written against a smaller corpus.
 *
 * The floor is 20, chosen on two grounds:
 *
 * (1) It must sit BELOW the smallest observed value with real headroom, because
 *     a plan is archived far more often than a registry entry is deleted. At 25
 *     the margin on `test-decision` is 2 — archiving two completed plans would
 *     fail the build for a reason that has nothing to do with the section
 *     surface. That is a brittle gate, not a strict one. At 20 the margin is 7:
 *     roughly a quarter of the corpus may be archived before the gate fires.
 *
 * (2) It must still be far above a real regression. The failure this gate exists
 *     to catch is a registry that stopped resolving H3s at all, which lands
 *     every selector at 0. 20 is nowhere near 0, so that signal is unaffected.
 *
 * 20 is therefore ~74% of the binding observation (27) — loose enough to
 * tolerate archiving, tight enough that any genuine resolution regression still
 * fails immediately.
 */
export const MIN_CORPUS_RESOLUTIONS = 20

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

/** Per-plan working set, so one plan counts at most once per selector. */
interface SelectorSets {
  resolved: Set<string>
  resolvedNonEmpty: Set<string>
  custom: Set<string>
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

/** Heading depth, or null when the line is not a `#{2,3}` heading. */
function headingOf(line: string): { level: 2 | 3; text: string } | null {
  const match = /^(#{2,3})\s+(.+?)\s*$/.exec(line)
  if (!match) return null
  return { level: match[1].length as 2 | 3, text: match[2] }
}

/**
 * Read a plan's H2/H3 headings and, for each, the body lines that follow it up
 * to the next heading of level <= its own (the same level-based boundary rule
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
    RUBRIC_H3_IDS.map((id) => [id, { resolved: new Set<string>(), resolvedNonEmpty: new Set<string>(), custom: new Set<string>(), ambiguous: 0 }]),
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
 * Measure a plans directory. `entries` defaults to the shipped
 * `PLAN_SECTION_REGISTRY`; the NEGATIVE scenario passes an empty registry to
 * simulate Plan A being absent.
 */
export function measureCorpus(
  plansDir: string,
  entries?: readonly SectionRegistryEntry[],
): CorpusStats {
  const stats: CorpusStats = {
    planCount: 0,
    bySelector: Object.fromEntries(
      RUBRIC_H3_IDS.map((id) => [id, emptySelectorStats()]),
    ),
    h3Total: 0,
    h3Resolved: 0,
    h3Custom: 0,
    h2Total: 0,
    h2Resolved: 0,
  }
  const perPlan = emptySelectorSets()
  const files = readdirSync(plansDir)
    .filter((name) => name.endsWith(".md") && statSync(join(plansDir, name)).isFile())
    .sort()
  for (const file of files) {
    stats.planCount += 1
    const headings = readHeadings(readFileSync(join(plansDir, file), "utf-8"))
    for (const heading of headings) {
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
        bucket.resolved.add(file)
        if (heading.body.length > 0) bucket.resolvedNonEmpty.add(file)
      } else {
        bucket.custom.add(file)
      }
    }
  }
  stats.bySelector = freezeSelectorStats(perPlan)
  return stats
}

/**
 * The gate itself. Returns the list of FAILURES; an empty list means the gate
 * HOLDS. Deliberately returns strings rather than throwing so the negative
 * scenario can assert on the failure text.
 */
export function gateFailures(stats: CorpusStats): string[] {
  const failures: string[] = []
  for (const id of RUBRIC_H3_IDS) {
    const bucket = stats.bySelector[id]
    if (bucket.ambiguous > 0) {
      failures.push(`${id}: ${bucket.ambiguous} ambiguous resolutions`)
    }
    if (bucket.resolvedNonEmpty < MIN_CORPUS_RESOLUTIONS) {
      failures.push(
        `${id}: only ${bucket.resolvedNonEmpty}/${stats.planCount} plans resolve to a non-empty body (need >= ${MIN_CORPUS_RESOLUTIONS})`,
      )
    }
  }
  if (stats.h3Total <= stats.h2Total) {
    failures.push(
      `H3 corpus coverage (${stats.h3Total}) does not exceed H2 (${stats.h2Total}) — the section surface was not widened past H2`,
    )
  }
  if (stats.h3Resolved <= stats.h3Custom) {
    failures.push(
      `resolvable H3s (${stats.h3Resolved}) do not exceed the custom fallback (${stats.h3Custom})`,
    )
  }
  return failures
}
