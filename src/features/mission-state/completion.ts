/**
 * Plan Completion Overlay
 *
 * Pure read-only verdict over the single checkbox implementation
 * (`countPlanProgressFromContent` in `storage.ts`, regexes in `constants.ts`).
 * This module NEVER counts checkboxes itself — it imports the counter and
 * adds the front-matter `status` AND-gate from `plan-contract/schema.ts`.
 *
 * Verdict rule: `complete` iff (all boxes checked AND status == "completed")
 * OR the explicit human `{ forceCompletion: true }` override applies.
 * Any checkbox/status disagreement yields `mismatch-warn` (warn-only; the
 * caller surfaces an advisory, never auto-flips). Zero-task plans
 * (`needsTriage`, e.g. humanize 0/4 or dwfinance 0/5 design docs) NEVER
 * verdict-complete — not even via override — so a gap can never masquerade
 * as done (silent-failure guard).
 */

import { isPlanComplete, PLAN_STATUS_ORDER } from "../plan-contract/schema"
import { countPlanProgressFromContent } from "./storage"
import type { PlanProgress } from "./types"

/** Authoritative front-matter status values (subset of plan-contract enum). */
export type FrontMatterStatus = (typeof PLAN_STATUS_ORDER)[number]

/** Minimal front-matter input the overlay reads; never written here. */
export interface CompletionFrontMatter {
  /** Authoritative `status` from front-matter; unknown/absent becomes null. */
  status: string
  /** Explicit human override; when true the AND-gate is bypassed. */
  forceCompletion?: boolean
}

/** Overlay verdict: complete, incomplete, or warn-only disagreement. */
export type CompletionVerdict = "complete" | "incomplete" | "mismatch-warn"

/** Read-only resolution result; checkbox counts are unchanged. */
export interface PlanCompletion {
  /** Checkbox progress from the single counter (imported, never recomputed). */
  checkbox: PlanProgress
  /** Normalized front-matter status, or null when absent/unknown. */
  status: FrontMatterStatus | null
  /** Overlay verdict per the AND-gate vs override rule. */
  verdict: CompletionVerdict
  /** True when the explicit human override was passed (even on triage). */
  overrideApplied: boolean
}

function normalizeStatus(raw: string | undefined): FrontMatterStatus | null {
  if (raw === undefined) return null
  return (PLAN_STATUS_ORDER as readonly string[]).includes(raw) ? (raw as FrontMatterStatus) : null
}

/**
 * Resolve plan completion from body checkboxes + front-matter status.
 *
 * Pure and read-only: checkbox counts come from
 * `countPlanProgressFromContent`; the AND-gate delegates to `isPlanComplete`.
 * Triage (`needsTriage`, zero tasks) short-circuits to a non-complete
 * verdict before the override is honored, so empty/design docs can never
 * report complete.
 */
export function resolvePlanCompletion(
  content: string,
  frontMatter: CompletionFrontMatter | null,
): PlanCompletion {
  //#given body content + optional front-matter
  const checkbox = countPlanProgressFromContent(content)
  const status = frontMatter === null ? null : normalizeStatus(frontMatter.status)
  const overrideApplied = frontMatter?.forceCompletion === true

  //#when applying triage guard, then the AND-gate vs override rule
  if (checkbox.needsTriage === true) {
    return {
      checkbox,
      status,
      verdict: status === "completed" ? "mismatch-warn" : "incomplete",
      overrideApplied,
    }
  }
  const allChecked = checkbox.isComplete
  const gatePass = isPlanComplete({
    allChecked,
    status: status ?? "",
    forceCompletion: frontMatter?.forceCompletion,
  })

  //#then map gate + agreement to the verdict
  if (gatePass) {
    return { checkbox, status, verdict: "complete", overrideApplied }
  }
  const disagrees =
    (allChecked && status !== null && status !== "completed") ||
    (!allChecked && status === "completed") ||
    (allChecked && status === null)
  return { checkbox, status, verdict: disagrees ? "mismatch-warn" : "incomplete", overrideApplied }
}

/**
 * Human-readable advisory for a `mismatch-warn` verdict.
 *
 * result into an existing warning channel only when non-null. Callers that
 * lack front-matter should skip the overlay (nothing authoritative to agree
 * with) and leave the verdict uncomputed.
 * Returns null unless the verdict is `mismatch-warn` — callers spread the
 * result into an existing warning channel only when non-null. Callers that
 * lack front-matter should skip the overlay (nothing authoritative to agree
 * with) and leave the verdict uncomputed.
 * Never throws; never touches checkbox counts.
 */
export function formatCompletionWarning(result: PlanCompletion): string | null {
  if (result.verdict !== "mismatch-warn") return null
  const { completed, total } = result.checkbox
  if (result.checkbox.needsTriage === true) {
    return `Plan reports status "${result.status ?? "unknown"}" with ${total} tasks: design doc needs triage, not completion`
  }
  if (result.status === "completed") {
    return `Plan status is "completed" but checkboxes are ${completed}/${total}: finish the boxes or move status back`
  }
  return `Plan checkboxes are ${completed}/${total} but status is "${result.status ?? "unknown"}": advance status only via human plan_update`
}
