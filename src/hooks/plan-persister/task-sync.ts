/**
 * Filtered Plan Sync Pipeline
 *
 * Single choke point for task -> plan checkbox sync. Both entry points —
 * the task_update/task_create trigger (one linked terminal task) and the
 * plan-persister capture() fallback (linked scan) — flow through
 * applyFilteredSync: syncCheckboxes (Task 3) -> recount via Task 2
 * constants -> atomicWrite + upsertMetadataComment. Every decision is logged.
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import type { MatrixxConfig } from "../../config/schema"
import {
  atomicWrite,
  checkboxOverlap,
  countPlanProgressFromContent,
  ensurePlanDir,
  readMissionState,
  readPlanFile,
  syncCheckboxesDetailed,
  upsertMetadataComment,
} from "../../features/mission-state"
import type { MissionState, PlanMeta } from "../../features/mission-state/types"
import { getTaskDir, readJsonSafe } from "../../features/task-storage/storage"
import { log } from "../../shared/logger"
import { resolveTasksConfig } from "../../shared/task-system-gating"
import { getGitHead } from "../../tools/handoff/git"
import type { TaskObject } from "../../tools/task/types"
import { TaskObjectSchema } from "../../tools/task/types"
import { collectLinkedTodos, isTaskLinkedToMission, isTerminalTaskStatus } from "./task-link"

const HOOK_NAME = "plan-sync"

export interface FilteredSyncInput {
  directory: string
  mission: MissionState
  planPath: string
  todos: Array<{ content: string; status: string }>
  actorSessionId: string
  matchSubject?: string
}

export interface MatchedBox {
  line: string
  shared: number
  score: number
}

export interface FilteredSyncResult {
  ok: boolean
  skippedReason?: string
  total: number
  completed: number
  flaggedVerification: string[]
  matched?: MatchedBox
}

function emptyResult(skippedReason: string): FilteredSyncResult {
  return { ok: false, skippedReason, total: 0, completed: 0, flaggedVerification: [] }
}

function findFlippedBox(before: string, after: string, subject: string): MatchedBox | undefined {
  const beforeLines = before.split("\n")
  const afterLines = after.split("\n")
  let best: MatchedBox | undefined
  const limit = Math.min(beforeLines.length, afterLines.length)
  for (let i = 0; i < limit; i += 1) {
    const b = beforeLines[i]
    const a = afterLines[i]
    if (b === a || !b.includes("[ ]") || !a.includes("[x]")) continue
    const text = a.slice(a.indexOf("]") + 1).trim()
    const { shared, score } = checkboxOverlap(text, subject)
    if (best === undefined || shared > best.shared) best = { line: a.trim(), shared, score }
  }
  return best
}

export async function applyFilteredSync(input: FilteredSyncInput): Promise<FilteredSyncResult> {
  const { directory, mission, planPath, todos, actorSessionId, matchSubject } = input
  if (!existsSync(planPath)) {
    log(`[${HOOK_NAME}] Sync skipped: plan file missing`, { plan: planPath })
    return emptyResult("missing-plan-file")
  }
  const content = readPlanFile(planPath)
  if (content === null) {
    log(`[${HOOK_NAME}] Sync skipped: plan unreadable`, { plan: planPath })
    return emptyResult("plan-file-unreadable")
  }
  const { content: synced, flaggedVerification } = syncCheckboxesDetailed(content, todos)
  const progress = countPlanProgressFromContent(synced)
  const gitHead = await getGitHead(directory)
  const meta: PlanMeta = {
    id: mission.plan_name,
    updatedAt: new Date().toISOString(),
    sessionId: actorSessionId,
    todoTotal: progress.total,
    todoCompleted: progress.completed,
    gitHead: gitHead ?? undefined,
  }
  ensurePlanDir(directory)
  if (!atomicWrite(planPath, upsertMetadataComment(synced, meta))) {
    log(`[${HOOK_NAME}] Sync failed: plan write failed`, { plan: planPath })
    return { ...emptyResult("plan-write-failed"), flaggedVerification }
  }
  const matched = matchSubject === undefined ? undefined : findFlippedBox(content, synced, matchSubject)
  log(`[${HOOK_NAME}] Plan synced`, {
    plan: planPath,
    total: progress.total,
    completed: progress.completed,
    flagged: flaggedVerification.length,
    matched: matched?.line,
    confidence: matched === undefined ? undefined : { shared: matched.shared, score: matched.score },
  })
  return { ok: true, total: progress.total, completed: progress.completed, flaggedVerification, matched }
}

export interface SyncTriggerInput {
  directory: string
  task: TaskObject
  config?: Partial<MatrixxConfig>
}

export interface SyncTriggerResult extends FilteredSyncResult {
  linked: boolean
}

export async function maybeSyncTaskToPlans(input: SyncTriggerInput): Promise<SyncTriggerResult> {
  const { directory, task, config = {} } = input
  if (!isTerminalTaskStatus(task.status)) {
    return { ...emptyResult("non-terminal-status"), linked: false }
  }
  const mission = readMissionState(directory)
  if (mission?.active_plan === undefined) {
    log(`[${HOOK_NAME}] Sync skipped: no active mission`, { taskId: task.id })
    return { ...emptyResult("no-mission-state"), linked: false }
  }
  const sessionScoped = resolveTasksConfig(config).session_scoped
  const taskDir = getTaskDir(config, directory)
  const decision = isTaskLinkedToMission(task, mission, {
    directory,
    sessionScoped,
    resolveParent: (parentID) => readJsonSafe(join(taskDir, `${parentID}.json`), TaskObjectSchema),
  })
  if (!decision.linked) {
    log(`[${HOOK_NAME}] Sync skipped: task unlinked`, {
      taskId: task.id,
      plan: mission.active_plan,
      reason: decision.reason,
    })
    return { ...emptyResult(`task-unlinked:${decision.reason}`), linked: false }
  }
  log(`[${HOOK_NAME}] Sync attempt: linked terminal task`, {
    taskId: task.id,
    plan: mission.active_plan,
    status: task.status,
    via: decision.reason,
  })
  const result = await applyFilteredSync({
    directory,
    mission,
    planPath: mission.active_plan,
    todos: [{ content: task.subject, status: task.status }],
    actorSessionId: task.threadID,
    matchSubject: task.subject,
  })
  return { ...result, linked: true }
}

export { collectLinkedTodos }
