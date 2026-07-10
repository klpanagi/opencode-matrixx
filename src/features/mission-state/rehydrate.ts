/**
 * Plan Persistence Rehydration
 *
 * Builds rehydration context from mission state + plan file for injection
 * after compaction or session start.
 */

import { existsSync } from "node:fs"
import { createSystemDirective } from "../../shared/system-directive"
import { parseMetadataComment, readPlanFile } from "./plan-storage"
import { getPlanProgress, readMissionState } from "./storage"
import type { RehydrationContext } from "./types"

const PLAN_DIRECTIVE_TYPE = "PLAN PERSISTER"

/**
 * Build a rehydration context from mission state + plan file.
 *
 * Returns null when:
 * - No mission file exists
 * - Mission has no active_plan
 * - Plan file is missing
 * - Plan is 100% complete (no point rehydrating a finished plan)
 */
export function buildRehydrationContext(directory: string): RehydrationContext | null {
  const mission = readMissionState(directory)
  if (!mission?.active_plan) return null

  const planPath = mission.active_plan
  if (!existsSync(planPath)) return null

  const content = readPlanFile(planPath)
  if (!content) return null

  const progress = getPlanProgress(planPath)
  if (progress.isComplete) return null

  const meta = parseMetadataComment(content)

  const progressSummary = `## Progress: ${progress.completed}/${progress.total} tasks completed`

  const sessionInfo = meta
    ? `\nLast active session: ${meta.sessionId}\nLast updated: ${meta.updatedAt}`
    : ""

  const directive = [
    createSystemDirective(PLAN_DIRECTIVE_TYPE),
    "",
    `## Active Plan: ${mission.plan_name}`,
    sessionInfo,
    "",
    content,
    "",
    progressSummary,
    "",
    "Continue working on this plan. Read the plan file above to find the next incomplete task.",
    "Mark tasks as [x] when completed.",
  ].join("\n")

  return {
    planName: mission.plan_name,
    planPath,
    content,
    progress: { total: progress.total, completed: progress.completed },
    directive,
  }
}

/**
 * Find active plan path from mission state.
 */
export function findActivePlan(directory: string): string | null {
  const mission = readMissionState(directory)
  return mission?.active_plan ?? null
}
