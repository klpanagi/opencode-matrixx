/**
 * Task 2 — task attribution: linked terminal tasks vs the plan's own tasks.
 *
 * NON-GOAL (linkage is convention only): the link is `metadata.planName` via
 * the 6-rule first-match-wins resolver at `plan-persister/task-link.ts`. There
 * is NO plan foreign key — `TaskSchema` is `.strict()` with no such field, and
 * the later rules key off `threadID`/`session_scoped` rather than the plan, so
 * a plan can absorb foreign tasks or none at all. Hence `linkage: "heuristic"`.
 *
 * FOLLOW-UP (out of scope here): adding a real FK to `TaskSchema` is a separate
 * migration. This module records the consequence instead of papering over it.
 *
 * Measured reality: `metadata.planName` is present in 0 of 48 task files, so
 * rule 2 — the only plan-name-keyed rule — never fires. `ratio === 0` is the
 * honest answer. The resolver is NOT widened to manufacture linkage.
 */
import { join } from "node:path"
import type { MatrixxConfig } from "../../config/schema"
import { isTaskLinkedToMission, isTerminalTaskStatus } from "../../hooks/plan-persister/task-link"
import { resolveTasksConfig } from "../../shared/task-system-gating"
import { TaskObjectSchema } from "../../tools/task/types"
import type { MissionState } from "../mission-state/types"
import { getTaskDir, listTaskFiles, readJsonSafe } from "../task-storage/storage"
import type { AttributionFacts, LinkedTerminalTask } from "./gather-types"

/**
 * Dimensions whose INPUT is task-level attribution. On an incomplete
 * attribution these degrade to `unscorable` — they are never scored.
 */
export const ATTRIBUTION_DEPENDENT_DIMENSIONS: readonly number[] = [1, 7]

export const ATTRIBUTION_INCOMPLETE_REASON =
  "attribution incomplete — linked terminal tasks do not account for the plan's tasks"

export interface LinkedTaskScan {
  linkedTerminalTasks: LinkedTerminalTask[]
  linkedTotal: number
}

/**
 * The 6-rule resolver is the shipped algorithm and is imported, never
 * reimplemented. The file scan around it is the only local logic: task files
 * come from `listTaskFiles` and are strict-parsed by `TaskObjectSchema`, so a
 * malformed file is invisible rather than a silent vote.
 */
export function scanLinkedTasks(
  directory: string,
  mission: MissionState,
  config: Partial<MatrixxConfig> = {},
): LinkedTaskScan {
  const sessionScoped = resolveTasksConfig(config).session_scoped
  const taskDir = getTaskDir(config, directory)
  const ids = listTaskFiles(config, directory)
  const resolveParent = (parentID: string) => readJsonSafe(join(taskDir, `${parentID}.json`), TaskObjectSchema)
  const linkedTerminalTasks: LinkedTerminalTask[] = []
  let linkedTotal = 0
  for (const id of ids) {
    const parsed = readJsonSafe(join(taskDir, `${id}.json`), TaskObjectSchema)
    if (parsed === null) continue
    const decision = isTaskLinkedToMission(parsed, mission, {
      directory,
      sessionScoped,
      resolveParent,
    })
    if (!decision.linked) continue
    linkedTotal += 1
    const terminal = isTerminalTaskStatus(parsed.status)
    if (terminal) linkedTerminalTasks.push({ id: parsed.id, status: parsed.status, terminal })
  }
  return { linkedTerminalTasks, linkedTotal }
}


/**
 * The attribution-completeness arithmetic. Data, not a verdict: the caller
 * decides what an incomplete ratio means, and the required behaviour on
 * mismatch is DEGRADE (see `ATTRIBUTION_DEPENDENT_DIMENSIONS`).
 */
export function computeAttribution(linkedTerminal: number, planTasks: number): AttributionFacts {
  return {
    linkedTotal: linkedTerminal,
    linkedTerminal,
    planTasks,
    ratio: planTasks === 0 ? 0 : linkedTerminal / planTasks,
    matches: planTasks > 0 && linkedTerminal >= planTasks,
  }
}

/**
 * Degrade — never score. Every attribution-dependent dimension is marked
 * `unscorable` when linked terminal tasks do not account for the plan's tasks.
 * A ratio of 0 degrades exactly the same set; there is no partial credit
 * because a partially-grounded dimension is an ungrounded dimension.
 */
export function computeDegradation(attribution: AttributionFacts): {
  unscorableDimensions: number[]
  reasons: Record<string, string>
} {
  if (attribution.matches) return { unscorableDimensions: [], reasons: {} }
  const reasons: Record<string, string> = {}
  for (const dimension of ATTRIBUTION_DEPENDENT_DIMENSIONS) {
    reasons[String(dimension)] = ATTRIBUTION_INCOMPLETE_REASON
  }
  return { unscorableDimensions: [...ATTRIBUTION_DEPENDENT_DIMENSIONS], reasons }
}
