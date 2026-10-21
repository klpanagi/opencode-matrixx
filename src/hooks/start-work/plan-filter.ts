/**
 * Staleness-aware plan classification for start-work.
 *
 * Replaces the bare `!getPlanProgress(p).isComplete` predicate: archived
 * plans are excluded, `total==0 needsTriage` plans leave the actionable set,
 * and mtime-stale plans with no linked active tasks are demoted to stale
 * candidates instead of hijacking auto-select.
 */

import { statSync } from "node:fs"
import type { MatrixxConfig } from "../../config/schema"
import { getPlanName, getPlanProgress, readPlanFile } from "../../features/mission-state"
import { formatCompletionWarning, resolvePlanCompletion } from "../../features/mission-state/completion"
import { parsePlanFrontMatter } from "../../features/plan-contract"
import { log } from "../../shared/logger"
import { resolveTasksConfig } from "../../shared/task-system-gating"
import { DEFAULT_STALE_AFTER_HOURS } from "../task-continuation-enforcer/staleness"

const HOUR_MS = 60 * 60 * 1000

/** Plans under this segment are archived candidates (see Task 6); never listed. */
export const ARCHIVED_PLAN_SEGMENT = "_archive"

export function isArchivedPlan(planPath: string): boolean {
  return planPath.split(/[\\/]/).includes(ARCHIVED_PLAN_SEGMENT)
}

/** Age of a plan file in ms since last write (mtime). Null when unstatable. */
export function getPlanAgeMs(planPath: string): number | null {
  try {
    return Date.now() - statSync(planPath).mtimeMs
  } catch {
    return null
  }
}

/**
 * Stale threshold in ms from plugin config.
 * `tasks.stale_after_hours` (default 24h, legacy `morpheus.tasks.*`).
 */
export function getPlansStaleAfterMs(config?: Partial<MatrixxConfig>): number {
  const hours = resolveTasksConfig(config).stale_after_hours ?? DEFAULT_STALE_AFTER_HOURS
  return hours * HOUR_MS
}

/** A plan whose file cannot be stat'ed is treated as fresh (not stale). */
export function isPlanStale(planPath: string, staleAfterMs: number): boolean {
  const ageMs = getPlanAgeMs(planPath)
  return ageMs !== null && ageMs > staleAfterMs
}

/** Human-readable age, e.g. "3h", "2d". Clamped at zero for clock skew. */
export function formatPlanAge(ageMs: number): string {
  const hours = Math.floor(Math.max(0, ageMs) / HOUR_MS)
  if (hours >= 24) {
    return `${Math.floor(hours / 24)}d`
  }
  return `${hours}h`
}

export interface ClassifyPlansOptions {
  staleAfterMs?: number
  /**
   * True when the plan still has linked active tasks. Defaults to false
   * (stale by mtime alone); the Task 6 reconciler wires the real linkage.
   */
  hasLinkedActiveTasks?: (planPath: string) => boolean
}

export interface ClassifiedPlans {
  /** Fresh incomplete plans — the only auto-select candidates. */
  actionable: string[]
  /** Mtime-stale incomplete plans — shown under a stale-candidate section. */
  staleCandidates: string[]
  /** total==0 plans — shown with a needsTriage tag, never actionable. */
  triage: string[]
  completed: string[]
}

/** One plan whose front-matter status disagrees with its checkboxes. */
export interface PlanMismatchWarning {
  planPath: string
  warning: string
}

/**
 * Read-only overlay scan: verdict per plan, warnings only for mismatches.
 *
 * Plans without front-matter are skipped (nothing authoritative to agree
 * with); checkbox counts are never recomputed here beyond the overlay's
 * single-counter delegation. Buckets in `classifyPlans` are untouched.
 */
export function collectCompletionMismatchWarnings(plans: string[]): PlanMismatchWarning[] {
  const out: PlanMismatchWarning[] = []
  for (const planPath of plans) {
    if (isArchivedPlan(planPath)) continue
    const content = readPlanFile(planPath)
    if (content === null) continue
    const frontMatter = parsePlanFrontMatter(content)
    if (frontMatter === null) continue
    const warning = formatCompletionWarning(resolvePlanCompletion(content, frontMatter))
    if (warning !== null) out.push({ planPath, warning })
  }
  return out
}

/**
 * Split plans into actionable / stale-candidate / triage / completed.
 * Input order (findOraclePlans mtime newest-first) is preserved per bucket.
 */
export function classifyPlans(plans: string[], opts: ClassifyPlansOptions = {}): ClassifiedPlans {
  const staleAfterMs = opts.staleAfterMs ?? getPlansStaleAfterMs()
  const result: ClassifiedPlans = { actionable: [], staleCandidates: [], triage: [], completed: [] }
  for (const planPath of plans) {
    if (isArchivedPlan(planPath)) continue
    const progress = getPlanProgress(planPath)
    if (progress.isComplete && !progress.needsTriage) {
      result.completed.push(planPath)
      continue
    }
    if (progress.needsTriage) {
      result.triage.push(planPath)
      continue
    }
    const linked = opts.hasLinkedActiveTasks?.(planPath) ?? false
    if (isPlanStale(planPath, staleAfterMs) && !linked) {
      result.staleCandidates.push(planPath)
    } else {
      result.actionable.push(planPath)
    }
  }
  // Overlay (read-only): verdict + warn-only log. Buckets above are untouched;
  // a checkbox/status mismatch is logged, never re-bucketed or auto-flipped.
  for (const { planPath, warning } of collectCompletionMismatchWarnings(plans)) {
    log("[plan-filter] Completion mismatch (warn-only; buckets unchanged)", { plan: planPath, warning })
  }
  return result
}

export type PlanListTag = "stale" | "needsTriage" | "mismatch"

/** True when front-matter status disagrees with checkboxes (read-only, warn-only). */
function hasCompletionMismatch(planPath: string): boolean {
  const content = readPlanFile(planPath)
  if (content === null) return false
  const frontMatter = parsePlanFrontMatter(content)
  if (frontMatter === null) return false
  return formatCompletionWarning(resolvePlanCompletion(content, frontMatter)) !== null
}

/** One numbered plan line: progress + mtime age + optional tag. */
export function formatPlanListLine(planPath: string, index: number, tag?: PlanListTag): string {
  const progress = getPlanProgress(planPath)
  const ageMs = getPlanAgeMs(planPath)
  const age = ageMs === null ? "unknown age" : `${formatPlanAge(ageMs)} ago`
  const tagSuffix = tag ? ` [${tag}]` : ""
  // Mismatch overlay (Task 6): read-only tag, never re-buckets; rides beside any explicit tag.
  const mismatchSuffix = tag !== "mismatch" && hasCompletionMismatch(planPath) ? " [mismatch]" : ""
  return `${index + 1}. [${getPlanName(planPath)}] - Progress: ${progress.completed}/${progress.total} - Updated: ${age}${tagSuffix}${mismatchSuffix}`
}
