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

// Hardcoded byte budgets (no config plumbing — small-fix mandate).
// Rehydration content is unbounded plan text; the cap must live here
// where the full plan file enters context.
export const MAX_REHYDRATION_BYTES = 8000
// Total compaction allowance: rehydration (8000) + injector worst case
// (~1500 static prompt + 1500 capped task history ~= 3000).
export const MAX_TOTAL_COMPACTION_BYTES = 11000

/**
 * Truncate a string to at most maxBytes UTF-8 bytes without splitting
 * a multibyte sequence. Byte-based (Buffer.byteLength), never .length.
 */
export function truncateUtf8ToBytes(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return ""
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value
  const buf = Buffer.from(value, "utf8").subarray(0, maxBytes)
  return buf.toString("utf8")
}

/** Combined injector prompt + rehydration directive size in UTF-8 bytes. */
export function measureCombinedCompactionBytes(injectorPrompt: string, directive: string): number {
  return Buffer.byteLength(injectorPrompt, "utf8") + Buffer.byteLength(directive, "utf8")
}

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

  const assemble = (body: string): string =>
    [
      createSystemDirective(PLAN_DIRECTIVE_TYPE),
      "",
      `## Active Plan: ${mission.plan_name}`,
      sessionInfo,
      "",
      body,
      "",
      progressSummary,
      "",
      "Continue working on this plan. Read the plan file above to find the next incomplete task.",
      "Mark tasks as [x] when completed.",
    ].join("\n")

  let body = content
  let directive = assemble(body)

  // Over budget: truncate the content portion only — path and progress
  // markers are never dropped. Mirrors the compaction-context-injector
  // `[... truncated]` marker idiom (hook.ts MAX_TASK_HISTORY_CHARS).
  if (Buffer.byteLength(directive, "utf8") > MAX_REHYDRATION_BYTES) {
    const marker = `[... truncated to ${MAX_REHYDRATION_BYTES} bytes \u2014 read full plan at ${planPath}]`
    const overhead = Buffer.byteLength(assemble(""), "utf8")
    const markerBytes = Buffer.byteLength(`\n${marker}`, "utf8")
    const allowed = Math.max(0, MAX_REHYDRATION_BYTES - overhead - markerBytes)
    body = `${truncateUtf8ToBytes(content, allowed)}\n${marker}`
    directive = assemble(body)
    // Safety loop: shrink further if framing rounds the budget over.
    while (Buffer.byteLength(directive, "utf8") > MAX_REHYDRATION_BYTES && body.length > marker.length) {
      body = `${truncateUtf8ToBytes(body.slice(0, Math.max(0, body.length - marker.length - 64)), Math.max(0, MAX_REHYDRATION_BYTES - overhead - markerBytes))}\n${marker}`
      directive = assemble(body)
    }
  }

  return {
    planName: mission.plan_name,
    planPath,
    content: body,
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
