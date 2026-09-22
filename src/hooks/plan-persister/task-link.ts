/**
 * Task-Plan Linkage Filter
 *
 * Decides whether a runtime task (T-*.json) may drive the active plan file.
 * Only linked tasks vote in plan sync — foreign sessions must never flip
 * another mission's checkboxes.
 *
 * Linkage signals, first match wins:
 * 1. projectRoot mismatch  -> never linked (different project)
 * 2. metadata.planName === mission.plan_name -> linked
 * 3. threadID in mission.session_ids -> linked
 * 4. parentID resolves to a linked task (depth-capped) -> linked
 * 5. no signals at all -> linked only when session_scoped=false (legacy)
 * 6. threadID outside the mission set -> linked only when session_scoped=false
 */
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { MatrixxConfig } from "../../config/schema"
import type { MissionState } from "../../features/mission-state/types"
import { getTaskDir, readJsonSafe } from "../../features/task-storage/storage"
import { log } from "../../shared/logger"
import { resolveTasksConfig } from "../../shared/task-system-gating"
import type { TaskObject } from "../../tools/task/types"
import { TaskObjectSchema } from "../../tools/task/types"
import { getStaleAfterMs, isTaskStale } from "../task-continuation-enforcer/staleness"

const HOOK_NAME = "plan-sync"

/** Task statuses that count as done (mirrors syncCheckboxesDetailed). */
const TERMINAL_TASK_STATUSES: ReadonlySet<string> = new Set(["completed", "cancelled", "deleted"])

export function isTerminalTaskStatus(status: string): boolean {
  return TERMINAL_TASK_STATUSES.has(status)
}

export interface LinkageOptions {
  directory: string
  sessionScoped: boolean
  resolveParent?: (parentID: string) => TaskObject | null
}

export interface LinkageDecision {
  linked: boolean
  reason: string
}

const MAX_PARENT_DEPTH = 3

export function isTaskLinkedToMission(
  task: TaskObject,
  mission: MissionState,
  opts: LinkageOptions,
  depth = 0,
  seen: ReadonlySet<string> = new Set(),
): LinkageDecision {
  if (task.projectRoot !== undefined && task.projectRoot !== opts.directory) {
    return { linked: false, reason: "project-mismatch" }
  }
  const planName = task.metadata?.planName
  if (typeof planName === "string" && planName === mission.plan_name) {
    return { linked: true, reason: "metadata-planName" }
  }
  if (task.threadID !== undefined && (mission.session_ids?.includes(task.threadID) ?? false)) {
    return { linked: true, reason: "threadID" }
  }
  if (task.parentID !== undefined && depth < MAX_PARENT_DEPTH && !seen.has(task.parentID)) {
    const parent = opts.resolveParent?.(task.parentID) ?? null
    if (parent !== null) {
      const next = new Set(seen)
      next.add(task.id)
      const parentDecision = isTaskLinkedToMission(parent, mission, opts, depth + 1, next)
      if (parentDecision.linked) {
        return { linked: true, reason: `parentID:${parentDecision.reason}` }
      }
    }
  }
  if (task.threadID === undefined && task.parentID === undefined) {
    return opts.sessionScoped
      ? { linked: false, reason: "no-linkage-signal" }
      : { linked: true, reason: "unscoped-no-signal" }
  }
  return opts.sessionScoped
    ? { linked: false, reason: "foreign-thread" }
    : { linked: true, reason: "unscoped-project-task" }
}

export interface LinkedTodos {
  todos: Array<{ content: string; status: string }>
  unknown: number
  skipped: Array<{ id: string; reason: string }>
}

/**
 * Filtered replacement for the old unfiltered union read: strict-parse every
 * task file (null = log + count as unknown, never a vote), drop stale files,
 * and admit only mission-linked tasks.
 */
export function collectLinkedTodos(
  directory: string,
  mission: MissionState,
  config: Partial<MatrixxConfig> = {},
): LinkedTodos {
  const sessionScoped = resolveTasksConfig(config).session_scoped
  const staleAfterMs = getStaleAfterMs(config)
  const taskDir = getTaskDir(config, directory)
  const todos: LinkedTodos["todos"] = []
  const skipped: LinkedTodos["skipped"] = []
  let unknown = 0
  if (!existsSync(taskDir)) return { todos, unknown, skipped }
  let files: string[]
  try {
    files = readdirSync(taskDir).filter((f) => f.startsWith("T-") && f.endsWith(".json"))
  } catch {
    log(`[${HOOK_NAME}] Task dir unreadable, no votes`, { taskDir })
    return { todos, unknown, skipped }
  }
  const resolveParent = (parentID: string): TaskObject | null =>
    readJsonSafe(join(taskDir, `${parentID}.json`), TaskObjectSchema)
  for (const f of files) {
    const path = join(taskDir, f)
    const parsed = readJsonSafe(path, TaskObjectSchema)
    if (parsed === null) {
      unknown += 1
      log(`[${HOOK_NAME}] Unknown task file (strict-schema null, never a vote)`, { file: f })
      continue
    }
    if (isTaskStale(path, staleAfterMs)) {
      skipped.push({ id: parsed.id, reason: "stale" })
      log(`[${HOOK_NAME}] Skipping stale task`, { taskId: parsed.id, file: f })
      continue
    }
    const decision = isTaskLinkedToMission(parsed, mission, {
      directory,
      sessionScoped,
      resolveParent,
    })
    if (!decision.linked) {
      skipped.push({ id: parsed.id, reason: decision.reason })
      log(`[${HOOK_NAME}] Skipping unlinked task`, { taskId: parsed.id, reason: decision.reason })
      continue
    }
    todos.push({ content: parsed.subject, status: parsed.status })
    log(`[${HOOK_NAME}] Linked task votes`, { taskId: parsed.id, via: decision.reason })
  }
  return { todos, unknown, skipped }
}
