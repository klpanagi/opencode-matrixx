/**
 * Plan Contract — Section-Registry Lifecycle (Task 8)
 *
 * Governs how LEGACY, GRANDFATHERED and RENAMED plans participate in section
 * resolution, and makes the RENAME failure mode visible instead of silent.
 *
 * THE FIVE LIFECYCLE RULES, verbatim:
 *
 * 1. "Legacy/grandfathered plans resolve sections exactly as modern plans do.
 *    A missing front-matter block does not affect section resolution — sections
 *    derive from the BODY, never from front-matter."
 * 2. "Unregistered headings in legacy plans resolve via the escape hatch. A
 *    grandfathered plan is not 'unchecked'; a registry miss is `custom`, never
 *    an error."
 * 3. "A plan whose basename is off the allowlist but which has no front-matter
 *    emits a distinct ADVISORY diagnostic separating 'renamed legacy plan' from
 *    'new plan lacking front-matter'. A renamed legacy plan is never told to
 *    add front-matter it deliberately lacks."
 * 4. "Never auto-migrate. Migration is apply-on-next-edit ONLY — no plan is
 *    rewritten automatically, and the allowlist is frozen, not dynamic."
 * 5. "Archive interaction: `_archive/` is the designed archival path and
 *    `src/tools/plan/types.ts` rejects subdirectories, so archived plans leave
 *    the tool surface. The registry INHERITS that behaviour; `_archive/` is
 *    deliberately NOT special-cased here."
 *
 * RENAME vs NEW-PLAN, the discriminator. Both are "off the allowlist AND has no
 * front-matter", so front-matter alone cannot tell them apart. The signal is the
 * legacy `<!-- plan-persister: {...} -->` metadata comment: every pre-front-matter
 * plan carries it (the persister hook wrote it), while a genuinely new plan does
 * not. That is a content-derived, non-destructive probe — nothing is written.
 *
 * WHY LOCAL CODES rather than `PLAN_ERROR_CODES`: that taxonomy in
 * `src/tools/plan/error-codes.ts` describes FAILED TOOL CALLS — a refusal that
 * aborted a read or a write. These diagnostics are ADVISORY: the call succeeded
 * and `result.ok` stays `true`. Filing them under failure codes would invite a
 * consumer to retry or treat a healthy legacy plan as a fault. They are declared
 * here instead, and are advisory `PlanContractWarning.code` values.
 *
 * NEVER promotes a front-matter state to an error, and never adds an
 * `errors.push` — `validate.ts` keeps exactly one, for empty content.
 */
import { basename } from "node:path"
import { parsePlanFrontMatter } from "./front-matter"
import { GRANDFATHER_ALLOWLIST } from "./migration"
import { resolveSectionSelector, type SectionResolution } from "./section-registry"
import type { PlanContractWarning } from "./types"

/** Advisory diagnostic codes. NOT `PlanErrorCode` — see the module header. */
export const PLAN_LIFECYCLE_CODES = {
  /** Basename left the allowlist but the body is a legacy plan. Fix the key. */
  legacyPlanRenamed: "legacy_plan_renamed_off_allowlist",
  /** No front-matter, no legacy metadata, not on the allowlist. */
  newPlanMissingFrontMatter: "new_plan_missing_front_matter",
} as const

export type PlanLifecycleCode = (typeof PLAN_LIFECYCLE_CODES)[keyof typeof PLAN_LIFECYCLE_CODES]

/** Which lifecycle bucket a plan falls into, after the allowlist lookup. */
export type PlanLifecycleState = "modern" | "grandfathered" | "legacy_renamed" | "new_plan_missing_front_matter"

/**
 * Compile-time exhaustiveness gate. `tsconfig.json` EXCLUDES `tests/`, so a
 * `Record`-shaped assertion in a test file is never checked by `tsc`; this
 * table in `src/` is the real gate. Adding a code without a row here fails the
 * build.
 */
const _LIFECYCLE_CODE_GATE: Record<PlanLifecycleCode, true> = {
  legacy_plan_renamed_off_allowlist: true,
  new_plan_missing_front_matter: true,
}
void _LIFECYCLE_CODE_GATE

/** Advisory outcome of a lifecycle lookup. Never carries errors. */
export interface PlanLifecycleReport {
  state: PlanLifecycleState
  /** Plan basename without `.md` — the key the allowlist is matched on. */
  planId: string
  /** Advisory diagnostics. Empty for `modern` and `grandfathered`. */
  warnings: PlanContractWarning[]
}

/** The legacy metadata comment the `plan-persister` hook stamps into a plan. */
const LEGACY_METADATA_RE = /<!--\s*plan-persister:/

/**
 * True when the body carries the legacy `plan-persister` comment — the only
 * durable, content-derived evidence that a plan predates front-matter. Used
 * solely to separate a RENAME from a NEW plan; it never gates resolution.
 */
function hasLegacyMetadata(content: string): boolean {
  return LEGACY_METADATA_RE.test(content)
}

/**
 * Classify a plan's lifecycle and return its ADVISORY diagnostics.
 *
 * Rule 1: a missing front-matter block is a lifecycle fact, never an input to
 * section resolution — this function does not resolve sections.
 * Rule 4: nothing here writes. The allowlist stays frozen; a renamed plan is
 * reported so a human can re-key it, never auto-re-adopted.
 */
export function classifyPlanLifecycle(filePath: string, content: string): PlanLifecycleReport {
  const planId = basename(filePath, ".md")
  if (parsePlanFrontMatter(content) !== null) return { state: "modern", planId, warnings: [] }
  if (GRANDFATHER_ALLOWLIST.includes(planId)) return { state: "grandfathered", planId, warnings: [] }
  if (hasLegacyMetadata(content)) {
    return {
      state: "legacy_renamed",
      planId,
      warnings: [
        {
          code: PLAN_LIFECYCLE_CODES.legacyPlanRenamed,
          message: `Plan "${planId}" carries the legacy plan-persister comment but its id is not on the grandfather allowlist — most likely a rename. Re-key the allowlist entry; this advisory deliberately does NOT ask for front-matter.`,
        },
      ],
    }
  }
  return {
    state: "new_plan_missing_front_matter",
    planId,
    warnings: [
      {
        code: PLAN_LIFECYCLE_CODES.newPlanMissingFrontMatter,
        message: `Plan "${planId}" has no front-matter and is not on the grandfather allowlist (advisory).`,
      },
    ],
  }
}

/** A section resolution paired with the lifecycle it was reached under. */
export interface PlanSectionLifecycleResolution {
  lifecycle: PlanLifecycleReport
  resolution: SectionResolution
}

/**
 * Resolve a section selector for a plan, identically for every lifecycle state.
 *
 * `content` never reaches the registry: sections derive from the BODY, so a
 * modern plan and the same plan as a legacy file resolve to the same value
 * (rules 1 and 2). The lifecycle is reported alongside so a caller can attach
 * the ADVISORY without conflating it with the resolution outcome — a rename
 * diagnostic never changes what a selector resolves to.
 */
export function resolveLifecycleSection(
  selector: string,
  filePath: string,
  content: string,
): PlanSectionLifecycleResolution {
  return {
    lifecycle: classifyPlanLifecycle(filePath, content),
    resolution: resolveSectionSelector(selector),
  }
}
