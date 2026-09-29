/**
 * Section locator for the WRITE path (Task 10).
 *
 * Split out of `section-edit.ts` purely to stay under the 200-LOC ceiling — the
 * locator is a self-contained concern (selector -> exactly one index entry, or a
 * fail-closed refusal) with no dependency on anchor conversion or the hash gate.
 *
 * PARITY IS THE POINT. This is a deliberate, behaviour-for-behaviour mirror of
 * the private `locateEntry` in `section-read.ts`, and it MUST stay in step with
 * it: a selector that is ambiguous on read is ambiguous on write, a repeated H3
 * without an occurrence index is a fail-closed `validation_error` on BOTH, and an
 * id that matches no heading is `section_not_found` listing the file's own ids on
 * BOTH. A write that is stricter or laxer than its read would make a section
 * addressable for reading and then unaddressable for writing, which is strictly
 * worse than either behaviour alone.
 *
 * The two copies are the KNOWN COST of this task: `section-read.ts` is owned by a
 * concurrent task and could not be edited to export its copy, so the shared
 * extraction is deferred to the consolidation task.
 *
 * WHY occurrence disambiguation happens against the FILE and not the registry:
 * registry uniqueness says nothing about in-file repetition — the same H3 can
 * appear many times in one plan — so picking a first match would make the write
 * target non-deterministic.
 */
import { resolveSectionSelector } from "../../features/plan-contract/section-registry"
import { PLAN_ERROR_CODES } from "./error-codes"
import type { PlanSectionIndexEntry } from "./types"

function errorBody(error: string, message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { error, message, ...extra }
}

/** Stable, de-duplicated list of the ids THIS file actually has. */
export function availableSectionIds(entries: PlanSectionIndexEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.id))]
}

/** Resolve a selector to exactly ONE entry, failing closed on duplicates. */
export function locateSectionEntry(
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
    const ids = availableSectionIds(entries)
    return {
      failure: errorBody(
        PLAN_ERROR_CODES.sectionNotFound,
        `Section "${selector}" resolves to no heading in this plan. Available sections: ${ids.join(", ")}`,
        { selector, availableSections: ids },
      ),
    }
  }
  if (occurrences.length === 1) return { entry: occurrences[0] as PlanSectionIndexEntry }
  const range = `0-${occurrences.length - 1}`
  if (sectionIndex === undefined) {
    return {
      failure: errorBody(
        PLAN_ERROR_CODES.validationError,
        `section "${selector}" occurs ${occurrences.length} times in this plan — pass sectionIndex (0-based, valid range ${range}) to choose one occurrence`,
        { argument: "sectionIndex" },
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
