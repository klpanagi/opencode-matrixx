/**
 * Plan reconciliation + stale-plan archival policy.
 *
 * The reconciler re-runs the Tasks 3-4 linkage pass (checkboxOverlap +
 * verification guard from plan-storage) with a confidence gate: only
 * high-confidence token overlap auto-checks, the rest is reported for
 * manual plan_update. Runs are idempotent — a converged plan yields no writes.
 *
 * Archival moves stale orphans to .matrixx/plans/_archive/ (never deletes).
 */

import { existsSync, mkdirSync, renameSync, statSync } from "node:fs"
import { basename, join } from "node:path"
import type { MatrixxConfig } from "../../config/schema"
import { log } from "../../shared/logger"
import { parsePlanFrontMatter } from "../plan-contract/front-matter"
import { getTaskDir, listTaskFiles, readJsonSafe } from "../task-storage/storage"
import { TaskSchema } from "../task-storage/types"
import { formatCompletionWarning, resolvePlanCompletion } from "./completion"
import { DEFAULT_STALE_AFTER_HOURS, ORACLE_PLANS_DIR, PLANS_ARCHIVE_DIR_NAME } from "./constants"
import {
  atomicWrite,
  checkboxOverlap,
  isVerificationStyle,
  readPlanFile,
  syncCheckboxesDetailed,
} from "./plan-storage"
import { findOraclePlans, readMissionState } from "./storage"

export interface ReconcileTodo { content: string; status: string }

export interface ReconcileResult {
  content: string; checked: string[]; lowConfidence: string[]; flaggedVerification: string[]; changed: boolean
}

export interface ReconcileFileResult extends ReconcileResult { wrote: boolean }

const UNCHECKED_BOX_RE = /^\s*[-*]\s*\[ \]\s*(.*)$/gm
const HOUR_MS = 3_600_000

function collectUnchecked(content: string): string[] {
  const texts: string[] = []
  for (const match of content.matchAll(UNCHECKED_BOX_RE)) {
    if (match[1] !== undefined) texts.push(match[1])
  }
  return texts
}

/**
 * High-confidence gate: token overlap matched (Task 3 thresholds) AND the
 * box is not verification-flagged. Verification-style boxes with genuine
 * overlap still flip (overlap wins); zero-overlap verification boxes land
 * in flaggedVerification and never auto-check.
 */
export function isHighConfidence(boxText: string, todoContent: string, flaggedVerification: string[] = []): boolean {
  if (flaggedVerification.includes(boxText)) return false
  return checkboxOverlap(boxText, todoContent).matched
}

/** Reconcile plan content against runtime todos; pure, no disk writes. */
export function reconcilePlanContent(content: string, todos: ReconcileTodo[]): ReconcileResult {
  const before = collectUnchecked(content)
  const { content: synced, flaggedVerification } = syncCheckboxesDetailed(content, todos)
  const afterSet = new Set(collectUnchecked(synced))
  const checked = before.filter((text) => !afterSet.has(text))
  const lowConfidence = collectUnchecked(synced).filter((text) => !isVerificationStyle(text))
  return { content: synced, checked, lowConfidence, flaggedVerification, changed: synced !== content }
}

/** Reconcile one plan file; writes only when content changed (idempotent). */
export function reconcilePlanFile(planPath: string, todos: ReconcileTodo[]): ReconcileFileResult {
  const content = readPlanFile(planPath)
  if (content === null) {
    return { content: "", checked: [], lowConfidence: [], flaggedVerification: [], changed: false, wrote: false }
  }
  const result = reconcilePlanContent(content, todos)
  const wrote = result.changed && atomicWrite(planPath, result.content)
  // Overlay (read-only): verdict + warn-only log on the reconciled content.
  // Buckets/counts above are untouched; a mismatch is logged, never auto-flipped.
  const reconciledFrontMatter = parsePlanFrontMatter(result.content)
  if (reconciledFrontMatter !== null) {
    const completionWarning = formatCompletionWarning(resolvePlanCompletion(result.content, reconciledFrontMatter))
    if (completionWarning !== null) {
      log("[mission-state] Completion mismatch (warn-only; counts unchanged)", { plan: planPath, warning: completionWarning })
    }
  }
  return { ...result, wrote }
}

/** Invocation point for start-work: reconcile only when plans compete (>1). */
export function shouldReconcileOnStartWork(incompleteCount: number): boolean {
  return incompleteCount > 1
}

export interface ActiveTaskSubjects { subjects: string[]; unknownTaskFiles: string[] }

/**
 * Subjects of active (pending/in_progress) tasks. Strict-schema drops
 * (readJsonSafe -> null) are counted + logged as unknown — never treated
 * as completed, never silently ignored.
 */
export function readActiveTaskSubjects(directory: string, config: Partial<MatrixxConfig> = {}): ActiveTaskSubjects {
  const subjects: string[] = []
  const unknownTaskFiles: string[] = []
  let ids: string[] = []
  try {
    ids = listTaskFiles(config, directory)
  } catch {
    return { subjects, unknownTaskFiles }
  }
  const dir = getTaskDir(config, directory)
  for (const id of ids) {
    const task = readJsonSafe(join(dir, `${id}.json`), TaskSchema)
    if (!task) {
      unknownTaskFiles.push(id)
      continue
    }
    if (task.status === "pending" || task.status === "in_progress") subjects.push(task.subject)
  }
  if (unknownTaskFiles.length > 0) log("[mission-state] Reconciler skipped strict-schema-drop task files", { unknownTaskFiles })
  return { subjects, unknownTaskFiles }
}

/** A plan whose file cannot be stat'ed is treated as fresh (not stale). */
export function isStaleByMtime(planPath: string, staleAfterHours: number = DEFAULT_STALE_AFTER_HOURS): boolean {
  try {
    return Date.now() - statSync(planPath).mtimeMs > staleAfterHours * HOUR_MS
  } catch {
    return false
  }
}

export type ArchiveDecision = "active-plan" | "linked-active-tasks" | "fresh" | "unreadable" | "stale-orphan"

/** Archive candidacy: stale mtime AND zero linked active tasks AND not active. */
export function isArchiveCandidate(
  planPath: string,
  content: string | null,
  subjects: string[],
  staleAfterHours: number,
  activePlan?: string | null,
): { candidate: boolean; reason: ArchiveDecision } {
  if (activePlan !== undefined && activePlan !== null && planPath === activePlan) {
    return { candidate: false, reason: "active-plan" }
  }
  if (content === null) return { candidate: false, reason: "unreadable" }
  const linked = collectUnchecked(content).some((box) => subjects.some((s) => checkboxOverlap(box, s).matched))
  if (linked) return { candidate: false, reason: "linked-active-tasks" }
  if (!isStaleByMtime(planPath, staleAfterHours)) return { candidate: false, reason: "fresh" }
  return { candidate: true, reason: "stale-orphan" }
}

export interface ArchiveScanOptions {
  staleAfterHours?: number
  activePlan?: string | null
  activeTaskSubjects?: string[]
  config?: Partial<MatrixxConfig>
  dryRun?: boolean
}

export interface ArchiveResult { candidates: string[]; moved: string[]; unknownTaskFiles: string[]; before: number; after: number }

/**
 * Move stale orphans to _archive/ preserving bytes (incl. plan-persister
 * meta). Dry-run reports candidates with zero moves. Never deletes.
 */
export function archiveStalePlans(directory: string, opts: ArchiveScanOptions = {}): ArchiveResult {
  const staleAfterHours = opts.staleAfterHours ?? DEFAULT_STALE_AFTER_HOURS
  const plans = findOraclePlans(directory)
  const before = plans.length
  const active = opts.activeTaskSubjects !== undefined
    ? { subjects: opts.activeTaskSubjects, unknownTaskFiles: [] as string[] }
    : readActiveTaskSubjects(directory, opts.config)
  const candidates = plans.filter(
    (p) => isArchiveCandidate(p, readPlanFile(p), active.subjects, staleAfterHours, opts.activePlan).candidate,
  )
  if (opts.dryRun === true) {
    return { candidates, moved: [], unknownTaskFiles: active.unknownTaskFiles, before, after: before }
  }
  const moved: string[] = []
  if (candidates.length > 0) mkdirSync(join(directory, ORACLE_PLANS_DIR, PLANS_ARCHIVE_DIR_NAME), { recursive: true })
  for (const planPath of candidates) {
    const dest = join(directory, ORACLE_PLANS_DIR, PLANS_ARCHIVE_DIR_NAME, basename(planPath))
    if (existsSync(dest)) {
      log("[mission-state] Archive skipped (collision)", { planPath, dest })
      continue
    }
    try {
      renameSync(planPath, dest)
      moved.push(dest)
      log("[mission-state] Archived stale plan", { planPath, dest })
    } catch {
      log("[mission-state] Archive move failed", { planPath, dest })
    }
  }
  const after = findOraclePlans(directory).length
  log("[mission-state] Archival complete", { before, after, moved: moved.length })
  return { candidates, moved, unknownTaskFiles: active.unknownTaskFiles, before, after }
}

export interface MissionReconcileOptions {
  dryRun?: boolean
  staleAfterHours?: number
  activeTaskSubjects?: string[]
  config?: Partial<MatrixxConfig>
}

export interface MissionReconcileResult {
  wrote: boolean
  reason: string
  candidates: string[]
  moved: string[]
  unknownTaskFiles: string[]
  suggestion?: string
}

/**
 * Mission-aware orphan backfill (dry-run-first; default dryRun: true).
 * Missing mission.json -> `{ wrote: false, reason: "no-mission-state" }` + stale-orphan
 * candidates via isArchiveCandidate, zero writes, suggests start-work. Checkbox flips
 * never happen here: any box rewrite stays on reconcilePlanFile/isHighConfidence path.
 */
export function reconcileMissionState(directory: string, opts: MissionReconcileOptions = {}): MissionReconcileResult {
  const dryRun = opts.dryRun ?? true
  const staleAfterHours = opts.staleAfterHours ?? DEFAULT_STALE_AFTER_HOURS
  const active = opts.activeTaskSubjects !== undefined
    ? { subjects: opts.activeTaskSubjects, unknownTaskFiles: [] as string[] }
    : readActiveTaskSubjects(directory, opts.config)
  const mission = readMissionState(directory)
  const plans = findOraclePlans(directory)
  if (mission === null) {
    const candidates = plans.filter(
      (p) => isArchiveCandidate(p, readPlanFile(p), active.subjects, staleAfterHours, null).reason === "stale-orphan",
    )
    log("[mission-state] Reconcile skipped: no mission state", { suggestion: "run start-work to establish mission" })
    return { wrote: false, reason: "no-mission-state", candidates, moved: [], unknownTaskFiles: active.unknownTaskFiles, suggestion: "run start-work to establish mission" }
  }
  const candidates = plans.filter(
    (p) => isArchiveCandidate(p, readPlanFile(p), active.subjects, staleAfterHours, mission.active_plan).candidate,
  )
  if (dryRun) return { wrote: false, reason: "dry-run", candidates, moved: [], unknownTaskFiles: active.unknownTaskFiles }
  const archived = archiveStalePlans(directory, { staleAfterHours, activePlan: mission.active_plan, activeTaskSubjects: active.subjects, config: opts.config })
  return { wrote: archived.moved.length > 0, reason: archived.moved.length > 0 ? "archived" : "converged", candidates: archived.candidates, moved: archived.moved, unknownTaskFiles: archived.unknownTaskFiles }
}
