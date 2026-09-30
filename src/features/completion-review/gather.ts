/**
 * Task 2 — the deterministic data-gathering layer for `/plan-review`.
 *
 * A PURE function over its sources: no model in the loop, no network, no
 * mutation, no clock, no randomness. It reports FACTS and their provenance;
 * the rubric (T5) and the report writer (T6) decide what they mean.
 *
 * NON-GOALS (each is a test in `tests/features/completion-review/gather.test.ts`):
 *
 * 1. DoD is NEVER merged into `isComplete`. `mission-state/storage.ts` counts
 *    numbered task lines and deliberately excludes Definition-of-Done lines,
 *    because "all tasks done" and "all acceptance criteria met" are two
 *    distinct signals. `dod` is surfaced separately and the separation is
 *    preserved.
 *
 * 2. `checkboxOverlap` (mission-state/plan-storage.ts) is a fragile
 * best-effort reconciliation between todos and checkboxes. It is NOT ground truth.
 * Every soft input is labelled `heuristic` rather than silently trusted.
 *
 * 3. Task→plan linkage is a CONVENTION, not a foreign key: `TaskSchema` is
 *    `.strict()` with no plan FK, and the resolver's later rules key off
 *    `threadID`/`session_scoped`, not the plan. A `kind: "heuristic"` tag
 *    guarantees the arithmetic is code, not that the inputs are grounded, so
 *    attribution completeness is checked separately and mismatches DEGRADE.
 *
 * 4. `_archive/` is EXCLUDED: `findOraclePlans` filters it, and the plan tool
 *    path validator rejects subdirectories — an archived plan is never a
 *    reviewable plan.
 *
 * 5. No hook, idle handler, or event handler may call this. It is a library
 *    invoked by `/plan-review` only.
 */
import { readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { measurePlanBytes, PLANS_ARCHIVE_DIR_NAME } from "../mission-state/constants"
import { readPlanFile } from "../mission-state/plan-storage"
import { countPlanProgressFromContent, findOraclePlans } from "../mission-state/storage"
import type { MissionState } from "../mission-state/types"
import { parsePlanContract } from "../plan-contract"
import { computeAttribution, computeDegradation, scanLinkedTasks } from "./gather-attribution"
import { defaultGitRunner, gatherDrift } from "./gather-drift"
import { gatherNotepads, matchNotepadsByTaskId } from "./gather-notepads"
import type {
  AdmissionFacts,
  GatheredReviewInputs,
  GatherSources,
  ProgressFacts,
} from "./gather-types"

export const NOTEPADS_DIR = ".matrixx/notepads"

export {
  ATTRIBUTION_DEPENDENT_DIMENSIONS,
  ATTRIBUTION_INCOMPLETE_REASON,
  computeAttribution,
  computeDegradation,
  scanLinkedTasks,
} from "./gather-attribution"
export { defaultGitRunner, gatherDrift, NO_START_COMMIT_REASON, readStartCommit } from "./gather-drift"
export { gatherNotepads, matchNotepadsByTaskId, readNotepad } from "./gather-notepads"
export type * from "./gather-types"

/**
 * Every `.matrixx/plans/*.md` a reviewer may consider. `_archive/` is filtered
 * out by the shared lister, so a stale archived plan can never be scored.
 */
export function gatherReviewablePlans(directory: string): string[] {
  return findOraclePlans(directory).filter((path) => !path.split(/[\\/]/).includes(PLANS_ARCHIVE_DIR_NAME))
}

function readPlanContent(planPath: string): string {
  const content = readPlanFile(planPath)
  if (content !== null) return content
  // Over the cap: the manifest is still produced upstream, so read the span
  // rather than dropping the plan entirely.
  try {
    return readFileSync(planPath, "utf-8")
  } catch {
    return ""
  }
}

function buildProgress(content: string): ProgressFacts {
  const progress = countPlanProgressFromContent(content)
  return { ...progress, remaining: progress.total - progress.completed }
}

function buildAdmission(
  linked: ReturnType<typeof scanLinkedTasks>,
  notepads: ReturnType<typeof gatherNotepads>,
): AdmissionFacts {
  const byTaskId = matchNotepadsByTaskId(notepads)
  const stamps: string[] = []
  for (const task of linked.linkedTerminalTasks) {
    const record = byTaskId.get(task.id)
    if (record?.hasCompletionStamp !== true) continue
    if (record.taskId !== null) stamps.push(record.taskId)
  }
  return {
    linkedTerminalTasks: linked.linkedTerminalTasks,
    notepadCompletionStamps: stamps,
    notepads,
    corroborationCount: linked.linkedTerminalTasks.length + stamps.length,
  }
}

/**
 * Assemble every code-computable input the rubric needs. Library only — this
 * has no hook, idle, or event-handler caller by design.
 */
export function gatherCompletionReviewInputs(sources: GatherSources): GatheredReviewInputs {
  const plans = gatherReviewablePlans(sources.directory)
  const planPath = sources.planPath ?? plans[0]
  if (planPath === undefined) {
    throw new Error(`no reviewable plan under ${join(sources.directory, ".matrixx/plans")}`)
  }
  const planName = basename(planPath, ".md")
  const content = readPlanContent(planPath)
  const contract = parsePlanContract(content)
  const mission: MissionState = {
    active_plan: planPath,
    started_at: "",
    session_ids: sources.sessionIds ?? [],
    plan_name: planName,
  }
  const linked = scanLinkedTasks(sources.directory, mission)
  const notepadDir = sources.notepadDir ?? join(sources.directory, NOTEPADS_DIR, planName)
  const notepads = gatherNotepads(notepadDir)
  const attribution = computeAttribution(linked.linkedTerminalTasks.length, contract.tasks.length)
  return {
    planPath,
    planName,
    bytes: measurePlanBytes(content),
    provenance: { linkage: "heuristic", checkboxSync: "heuristic" },
    progress: buildProgress(content),
    tasks: contract.tasks,
    dod: contract.dod,
    attribution,
    admission: buildAdmission(linked, notepads),
    drift: gatherDrift(content, sources.directory, sources.runGit ?? defaultGitRunner, sources.startCommit),
    degradation: computeDegradation(attribution),
  }
}

/** Concatenated comment lines of every `gather*` source file. */
export function readGatherSourceComments(dir: string): string {
  return readdirSync(dir)
    .filter((file) => file.startsWith("gather") && file.endsWith(".ts"))
    .map((file) => readFileSync(join(dir, file), "utf-8"))
    .join("\n")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim()
      return trimmed.startsWith("*") || trimmed.startsWith("//")
    })
    .join("\n")
}
