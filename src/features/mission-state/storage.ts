/**
 * Mission State Storage
 *
 * Handles reading/writing mission.json for active plan tracking.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import {
  MISSION_DIR,
  MISSION_FILE,
  NUMBERED_CHECKED_RE,
  NUMBERED_UNCHECKED_RE,
  ORACLE_PLANS_DIR,
  PLANS_ARCHIVE_DIR_NAME,
  TOP_CHECKED_RE,
  TOP_UNCHECKED_RE,
} from "./constants"
import type { MissionState, PlanProgress } from "./types"

function getMissionFilePath(directory: string): string {
  return join(directory, MISSION_DIR, MISSION_FILE)
}

export function readMissionState(directory: string): MissionState | null {
  const filePath = getMissionFilePath(directory)

  if (!existsSync(filePath)) {
    return null
  }

  try {
    const content = readFileSync(filePath, "utf-8")
    const parsed: unknown = JSON.parse(content)
    return normalizeMissionState(parsed)
  } catch {
    return null
  }
}

/**
 * Normalize a parsed mission.json value in memory (no disk rewrite).
 * Legacy files used a singular `session_id` string; modern files use
 * `session_ids[]`. Missing or non-array values become `[]` unless a
 * legacy `session_id` string is present, which becomes `[session_id]`.
 */
export function normalizeMissionState(parsed: unknown): MissionState | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null
  }
  const state = parsed as MissionState & { session_id?: unknown }
  if (!Array.isArray(state.session_ids)) {
    const legacy = state.session_id
    state.session_ids =
      typeof legacy === "string" && legacy.length > 0 ? [legacy] : []
  }
  return state
}

/**
 * Rotate the mission when its active plan is complete: clear mission.json
 * so the next start-work run auto-selects instead of zombie-resuming.
 * Returns `{ rotated: true, state: null }` after clearing, otherwise the
 * preserved state. Never rewrites an incomplete or missing mission.
 */
export function rotateMissionIfComplete(directory: string): {
  rotated: boolean
  state: MissionState | null
} {
  const state = readMissionState(directory)
  if (!state) {
    return { rotated: false, state: null }
  }
  if (getPlanProgress(state.active_plan).isComplete) {
    clearMissionState(directory)
    return { rotated: true, state: null }
  }
  return { rotated: false, state }
}

export function writeMissionState(directory: string, state: MissionState): boolean {
  const filePath = getMissionFilePath(directory)

  try {
    const dir = dirname(filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8")
    return true
  } catch {
    return false
  }
}

export function appendSessionId(directory: string, sessionId: string): MissionState | null {
  const state = readMissionState(directory)
  if (!state) return null

  if (!state.session_ids?.includes(sessionId)) {
    if (!Array.isArray(state.session_ids)) {
      state.session_ids = []
    }
    state.session_ids.push(sessionId)
    if (writeMissionState(directory, state)) {
      return state
    }
  }

  return state
}

export function clearMissionState(directory: string): boolean {
  const filePath = getMissionFilePath(directory)

  try {
    if (existsSync(filePath)) {
      const { unlinkSync } = require("node:fs")
      unlinkSync(filePath)
    }
    return true
  } catch {
    return false
  }
}

/**
 * Find Oracle plan files for this project.
 * Oracle stores plans at: {project}/.matrixx/plans/{name}.md
 */
export function findOraclePlans(directory: string): string[] {
  const plansDir = join(directory, ORACLE_PLANS_DIR)

  if (!existsSync(plansDir)) {
    return []
  }

  try {
    const files = readdirSync(plansDir)
    return files
      .filter((f) => f !== PLANS_ARCHIVE_DIR_NAME && f.endsWith(".md"))
      .map((f) => join(plansDir, f))
      .sort((a, b) => {
        // Sort by modification time, newest first
        const aStat = require("node:fs").statSync(a)
        const bStat = require("node:fs").statSync(b)
        return bStat.mtimeMs - aStat.mtimeMs
      })
  } catch {
    return []
  }
}

/**
 * Count checkbox progress from plan content.
 *
 * Single content-level implementation behind getPlanProgress: numbered
 * task lines (Oracle format) win when present, otherwise all top-level
 * checkboxes count. Indented boxes never count. Do NOT inline checkbox
 * regexes elsewhere — import the Task 2 constants instead.
 */
export function countPlanProgressFromContent(content: string): PlanProgress {
  // Match markdown checkboxes: - [ ] or - [x] or - [X]
  const uncheckedMatches = content.match(TOP_UNCHECKED_RE) || []
  const checkedMatches = content.match(TOP_CHECKED_RE) || []

  // Prefer numbered task lines (Oracle plan format: "- [ ] 1. Task").
  // Meta/verification checkboxes (Definition-of-Done, Final Checklist) are
  // NOT numbered and must not count toward completion — otherwise a
  // functionally-complete plan never reports isComplete=true. Fall back to
  // all top-level checkboxes when the plan has no numbered tasks
  // (hand-written plans).
  const numberedUnchecked = content.match(NUMBERED_UNCHECKED_RE) || []
  const numberedChecked = content.match(NUMBERED_CHECKED_RE) || []

  const useNumbered = numberedUnchecked.length + numberedChecked.length > 0
  const total = useNumbered
    ? numberedUnchecked.length + numberedChecked.length
    : uncheckedMatches.length + checkedMatches.length
  const completed = useNumbered ? numberedChecked.length : checkedMatches.length

  return {
    total,
    completed,
    isComplete: total === 0 || completed === total,
    needsTriage: total === 0,
  }
}

/**
 * Parse a plan file and count checkbox progress.
 */
export function getPlanProgress(planPath: string): PlanProgress {
  if (!existsSync(planPath)) {
    return { total: 0, completed: 0, isComplete: true, needsTriage: true }
  }

  try {
    const content = readFileSync(planPath, "utf-8")
    return countPlanProgressFromContent(content)
  } catch {
    return { total: 0, completed: 0, isComplete: true, needsTriage: true }
  }
}

/**
 * Extract plan name from file path.
 */
export function getPlanName(planPath: string): string {
  return basename(planPath, ".md")
}

/**
 * Create a new mission state for a plan.
 */
export function createMissionState(
  planPath: string,
  sessionId: string,
  agent?: string
): MissionState {
  return {
    active_plan: planPath,
    started_at: new Date().toISOString(),
    session_ids: [sessionId],
    plan_name: getPlanName(planPath),
    ...(agent !== undefined ? { agent } : {}),
  }
}
