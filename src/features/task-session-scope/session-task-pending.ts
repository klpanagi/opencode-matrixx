import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { MatrixxConfig } from "../../config/schema"
import { getStaleAfterMs, isTaskStale } from "../../hooks/task-continuation-enforcer/staleness"
import { getIncompleteTasks } from "../../hooks/task-continuation-enforcer/todo"
import { log } from "../../shared/logger"
import { TaskObjectSchema } from "../../tools/task/types"
import { getTaskDir, readJsonSafe } from "../task-storage/storage"
import type { Task } from "../task-storage/types"
import { expandByParentAncestry } from "./ancestry"

const LOG_SCOPE = "[task-session-scope]"

export interface SessionTaskQuery {
  /** Plugin config; only the `tasks.*` storage/staleness keys are consulted. */
  config?: Partial<MatrixxConfig>
  /** Project directory — the task store is resolved from it. */
  directory: string
  /** The session whose pending work is being asked about. */
  sessionID: string
  /** Explicit subagent session ids to include in the scope. */
  subagentIDs?: string[]
  /**
   * Drop tasks whose file has had no write activity past the stale threshold.
   * Defaults to true so a worker that died cannot leak a pending handle forever.
   */
  excludeStale?: boolean
  /**
   * Max `parentID` hops followed upward when admitting delegated workers' tasks.
   * Defaults to 3 (`DEFAULT_ANCESTRY_DEPTH`), matching `MAX_PARENT_DEPTH` in
   * `src/hooks/plan-persister/task-link.ts`. Deeper chains stay out of scope, which
   * under-counts rather than over-counts — the safe direction for a completion gate.
   */
  ancestryDepth?: number
  /**
   * Overrides the config-derived stale window (`tasks.stale_after_hours`, default 24h)
   * for this query only. The background completion gates pass a much shorter window
   * (`tasks.background_stale_after_hours`, default 2h) so a dead background handle is
   * not held open for a full day, while the continuation enforcer keeps its 24h.
   */
  staleAfterMs?: number
}

/**
 * Read the file-backed task store (`.matrixx/tasks/T-{uuid}.json`) and return the
 * tasks that belong to one specific session, i.e. the substrate that replaces the
 * legacy OpenCode todo read.
 *
 * Fail-open contract: every failure mode resolves to "no pending work" — `[]` from
 * {@link readSessionTasks}, `false` from {@link hasIncompleteTasksForSession}. A
 * missing directory, an unparseable file, or an unexpected exception must never
 * block completion of anything, because the predicate feeds completion gates where
 * a stuck `true` is a livelock and a stuck `false` is a harmless lost nudge. Nothing
 * here throws; the one wrapping `try`/`catch` always logs before returning.
 *
 * Strict scope: a task is kept only when its `threadID` is the queried session or
 * one of the explicitly listed subagent ids. `tasks.session_scoped` is deliberately
 * NOT read here — `src/config/schema/tasks.ts` scopes that key to the
 * task-continuation-enforcer alone, and widening the scope of a completion gate to
 * "every project task" is exactly the livelock this module exists to prevent.
 * This intentionally diverges from `filterTasksBySession`, which stays lenient
 * (unscoped opt-out plus pass-through for unattributed tasks) for the enforcer;
 * the divergence is documented, not erased.
 *
 * `TaskObjectSchema.threadID` is required, so a task with no session attribution
 * fails schema validation and is skipped by `readJsonSafe`. That is a feature: it
 * makes unscoped tasks structurally invisible here, eliminating the "unscoped task
 * blocks every session" vector.
 *
 * The direct filter above is not the whole scope. Work delegated to a subagent (or a
 * grandchild) is recorded under the *worker's* `threadID`, so the strict match alone
 * would let a parent complete while its own delegated work is still open. The kept
 * set is therefore expanded upward along the on-disk `parentID` chain by
 * `expandByParentAncestry` — see `./ancestry.ts` for the depth bound, the cycle rule,
 * and why that backstop is durable where the in-memory `subagentSessions` registry is
 * not. `subagentIDs` stays: the union is the correct scope, since the registry still
 * adds coverage while the process is alive.
 *
 * Staleness uses the real exports `getStaleAfterMs` / `isTaskStale` from the
 * enforcer's `staleness.ts` (their names are unchanged; only this call site is new).
 */
export function readSessionTasks(query: SessionTaskQuery): Task[] {
  try {
    const taskDir = getTaskDir(query.config ?? {}, query.directory)
    if (!existsSync(taskDir)) {
      log(`${LOG_SCOPE} No task dir`, { sessionID: query.sessionID, taskDir })
      return []
    }

    const files = readdirSync(taskDir).filter((f) => f.startsWith("T-") && f.endsWith(".json"))
    const tasks: Task[] = []
    for (const file of files) {
      // null covers invalid JSON, a failed schema match, and an unreadable file.
      const parsed = readJsonSafe(join(taskDir, file), TaskObjectSchema)
      if (parsed) tasks.push(parsed)
    }

    const scoped = expandByParentAncestry(
      tasks.filter((task) => {
        if (task.threadID === query.sessionID) return true
        if (!task.threadID) return false
        return query.subagentIDs?.includes(task.threadID) === true
      }),
      tasks,
      { taskDir, depth: query.ancestryDepth },
    )

    const excludeStale = query.excludeStale ?? true
    if (!excludeStale) return scoped

    const staleAfterMs = query.staleAfterMs ?? getStaleAfterMs(query.config)
    const fresh = scoped.filter((task) => !isTaskStale(join(taskDir, `${task.id}.json`), staleAfterMs))
    if (fresh.length !== scoped.length) {
      log(`${LOG_SCOPE} Dropped stale tasks`, {
        sessionID: query.sessionID,
        dropped: scoped.length - fresh.length,
        staleAfterMs,
      })
    }
    return fresh
  } catch (error) {
    log(`${LOG_SCOPE} Read failed, treating as no pending work`, {
      sessionID: query.sessionID,
      error: String(error),
    })
    return []
  }
}

/**
 * Does this session still have pending work in the file-backed task store?
 *
 * Equivalent to `getIncompleteTasks(readSessionTasks(query)).length > 0`.
 * Fails open — see the fail-open contract on {@link readSessionTasks}.
 *
 * `dropSubtasksWithResolvedParent` is intentionally NOT applied. Counting a
 * subtask whose parent is already resolved only over-counts, which keeps the
 * agent working a little longer; dropping it under-counts, which is the direction
 * that lets unfinished work go unnoticed. For a completion gate the safe error is
 * the conservative one.
 */
export function hasIncompleteTasksForSession(query: SessionTaskQuery): boolean {
  try {
    return getIncompleteTasks(readSessionTasks(query)).length > 0
  } catch (error) {
    log(`${LOG_SCOPE} Predicate failed, reporting no pending work`, {
      sessionID: query.sessionID,
      error: String(error),
    })
    return false
  }
}
