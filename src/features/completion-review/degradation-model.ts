/**
 * Task 6 — a MODEL dimension whose plan section is ABSENT is `unscorable`.
 *
 * Absence is detected through `resolveSectionSelector`, never by matching
 * heading text. The plan's own headings are turned into a registry and the
 * canonical selector is resolved against it, which is precisely the escape
 * hatch Plan A built: a heading with no registry match returns `kind: "custom"`,
 * and `custom` here means ABSENT rather than "not a failure". `ambiguous` is
 * also treated as absent, because two candidate sections means the reviewer
 * cannot say which one the plan meant.
 *
 * String matching would be wrong here for a reason the corpus demonstrates: two
 * live plans spell the same section `"Must NOT Have (guardrails)"` and
 * `"Must NOT have (Guardrails)"`. A text comparison splits those; the
 * normalizer the registry already uses does not. (T1's correction, restated.)
 *
 * The consequence of absence is EXCLUSION from the weighted mean, not a 0.
 */

import type { PlanSectionIndexEntry } from "../../tools/plan/types"
import { buildSectionRegistry, resolveSectionSelector } from "../plan-contract/section-registry"

/**
 * MODEL dimensions that read one specific plan section. A dimension absent from
 * this table is not section-gated: the model judges it from the plan as a whole,
 * so no heading can make it `unscorable`. Only genuine section dependencies are
 * listed — claiming a dependency that does not exist would silently drop a
 * dimension from the mean for every plan.
 */
export const MODEL_SECTION_SOURCES: Readonly<Record<string, string>> = {
  "guardrail-adherence": "Must NOT Have (Guardrails)",
  completeness: "Work Objectives",
}

/** Dimension ids whose required section is not present in the plan. */
export function detectMissingModelSections(
  sections: readonly PlanSectionIndexEntry[],
): string[] {
  const planRegistry = buildSectionRegistry(
    sections.map((entry) => ({ heading: entry.headingText, level: entry.level })),
  )
  return Object.entries(MODEL_SECTION_SOURCES)
    .filter(([, heading]) => resolveSectionSelector(heading, planRegistry).kind !== "resolved")
    .map(([id]) => id)
}

/** The reason a section-gated MODEL dimension reports when its section is absent. */
export function missingSectionReason(dimensionId: string): string {
  const heading = MODEL_SECTION_SOURCES[dimensionId]
  return `plan has no ${heading} section`
}
