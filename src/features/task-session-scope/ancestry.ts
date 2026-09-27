/**
 * Durable Parent Ancestry Walk
 *
 * Widens a session's task scope along `TaskObject.parentID` so work delegated to a
 * subagent — and to a grandchild — is still visible to a completion gate. The chain
 * is on disk and survives restarts, which the in-memory `subagentSessions` registry
 * does not, so this is the durable backstop rather than a replacement for it.
 *
 * Discipline copied from `src/hooks/plan-persister/task-link.ts` (`MAX_PARENT_DEPTH`
 * plus the `seen`-set recursion). The walk is *upward only*: from a candidate,
 * through `parentID`, until it either reaches a task already in scope or runs out of
 * budget.
 *
 * Fail-soft, twice over: an unresolvable parent (missing, unreadable, or failing
 * `TaskObjectSchema`) stops that candidate's walk without admitting it, and any
 * unexpected exception returns the un-walked set. This feeds a completion gate, where
 * a stuck `true` is a livelock and a stuck `false` is a harmless lost nudge — so scope
 * is never widened on evidence that could not be read.
 *
 * `TaskObject.owner` is deliberately NOT a scope signal: it is an arbitrary string
 * with no referential integrity, so matching on it would be unsound.
 */
import { join } from "node:path"
import { log } from "../../shared/logger"
import { TaskObjectSchema } from "../../tools/task/types"
import { readJsonSafe } from "../task-storage/storage"
import type { Task } from "../task-storage/types"

const LOG_SCOPE = "[task-session-scope/ancestry]"

/**
 * Maximum parentID hops followed from a candidate to an in-scope ancestor.
 * Mirrors `MAX_PARENT_DEPTH = 3` in `task-link.ts`: candidate → parent (1) →
 * grandparent (2) → great-grandparent (3). A task at hop 4 or beyond is not included.
 */
export const DEFAULT_ANCESTRY_DEPTH = 3

export interface AncestryOptions {
  /** Directory holding the `T-*.json` store; parents are resolved inside it only. */
  taskDir: string
  /** Max parentID hops. Defaults to {@link DEFAULT_ANCESTRY_DEPTH}. */
  depth?: number
}

/**
 * Does this task's `parentID` chain reach a task that is already in scope?
 *
 * `seen` carries the current task's own id (per the `task-link.ts` discipline) so a
 * cycle terminates rather than spinning. A hop that lands on an in-scope id is a
 * genuine descendant and returns true; a hop that lands on an already-visited id is
 * a cycle and returns false. The in-scope check runs *first* so a cycle that does
 * reach a kept node still resolves to inclusion rather than being discarded.
 */
function reachesScope(task: Task, inScope: ReadonlySet<string>, opts: AncestryOptions): boolean {
  const maxDepth = opts.depth ?? DEFAULT_ANCESTRY_DEPTH
  const seen = new Set<string>([task.id])
  let currentID: string | undefined = task.parentID
  let hop = 0
  while (currentID !== undefined && hop < maxDepth) {
    if (inScope.has(currentID)) return true
    if (seen.has(currentID)) return false
    seen.add(currentID)
    const parent = readJsonSafe(join(opts.taskDir, `${currentID}.json`), TaskObjectSchema)
    if (parent === null) return false
    currentID = parent.parentID
    hop += 1
  }
  return false
}

/**
 * Expand an in-scope task set with every candidate whose `parentID` chain reaches it.
 *
 * Returns `scoped` plus the newly admitted candidates, preserving input order. The
 * walk is one pass over the candidates against the *original* in-scope set, so it
 * cannot run away: adding a candidate never creates a new root that a later candidate
 * could hang off. Two candidates chained to each other (both foreign) are therefore
 * both excluded — correct, since neither is anchored to this session.
 */
export function expandByParentAncestry(
  scoped: Task[],
  candidates: Task[],
  opts: AncestryOptions,
): Task[] {
  try {
    const inScope = new Set(scoped.map((t) => t.id))
    const admitted = candidates.filter(
      (task) => !inScope.has(task.id) && reachesScope(task, inScope, opts),
    )
    if (admitted.length > 0) {
      log(`${LOG_SCOPE} Widened scope via parentID ancestry`, {
        depth: opts.depth ?? DEFAULT_ANCESTRY_DEPTH,
        admitted: admitted.map((t) => ({ id: t.id, parentID: t.parentID })),
      })
    }
    return [...scoped, ...admitted]
  } catch (error) {
    log(`${LOG_SCOPE} Ancestry walk failed, keeping the un-walked scope`, {
      error: String(error),
      scoped: scoped.length,
    })
    return scoped
  }
}
