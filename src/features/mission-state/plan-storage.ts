/**
 * Plan Persistence Storage
 *
 * Atomic file operations for plan files.
 * Reuses the write-temp-then-rename pattern from handoff/storage.ts.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { MAX_PLAN_FILE_BYTES, META_TAG_PREFIX, META_TAG_SUFFIX, PLANS_DIR } from "./constants"
import type { PlanMeta } from "./types"

/**
 * Ensure the .matrixx/plans directory exists under the project root.
 */
export function ensurePlanDir(directory: string): boolean {
  try {
    mkdirSync(join(directory, PLANS_DIR), { recursive: true })
    return true
  } catch {
    return false
  }
}

/**
 * Read a plan file's content.
 * Returns null if the file does not exist, is too large, or cannot be read.
 */
export function readPlanFile(planPath: string): string | null {
  try {
    if (!existsSync(planPath)) return null
    const content = readFileSync(planPath, "utf-8")
    if (content.length > MAX_PLAN_FILE_BYTES) return null
    return content
  } catch {
    return null
  }
}

/**
 * Atomic write: write to a .tmp.{pid} file, then rename over the target.
 * Prevents partial/corrupt files on crash mid-write.
 */
export function atomicWrite(filePath: string, content: string): boolean {
  try {
    const tmpPath = `${filePath}.tmp.${process.pid}`
    writeFileSync(tmpPath, content, "utf-8")
    renameSync(tmpPath, filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Write content to a plan file using atomic write.
 * Ensures the plan directory exists first.
 */
export function writePlanFile(directory: string, planPath: string, content: string): boolean {
  try {
    ensurePlanDir(directory)
    return atomicWrite(planPath, content)
  } catch {
    return false
  }
}

/**
 * Verification-style guard: boxes matching verify/verification/checklist/
 * definition-of-done/final check with zero task overlap are never
 * force-completed — state kept, line reported via `flaggedVerification`.
 */
export const VERIFICATION_STYLE_RE = /verify|verification|checklist|definition-of-done|final check/i

const SYNC_STOP_WORDS = new Set(["the", "a", "an", "to", "of", "and", "or", "for", "with", "on", "in"])
const SYNC_OVERLAP_RATIO = 0.5
const SYNC_MIN_SHARED = 2

/** Lowercase, strip punctuation/numbers, split tokens, drop stop-words. */
export function normalizeCheckboxText(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((t) => t.length > 0 && !SYNC_STOP_WORDS.has(t))
}

export const isVerificationStyle = (text: string): boolean => VERIFICATION_STYLE_RE.test(text)

/**
 * Token overlap: match on >= 2 shared content tokens, or on shorter-side
 * ratio >= 0.5 with normalized-set equality (equality keeps exact matches
 * like "Task A"; without it one generic word cross-matches every sibling,
 * e.g. "Task D" would flip on completed "Task A").
 */
export function checkboxOverlap(a: string, b: string): { shared: number; score: number; matched: boolean } {
  const aT = new Set(normalizeCheckboxText(a))
  const bT = new Set(normalizeCheckboxText(b))
  if (aT.size === 0 || bT.size === 0) return { shared: 0, score: 0, matched: false }
  let shared = 0
  for (const t of aT) if (bT.has(t)) shared += 1
  const score = shared / Math.min(aT.size, bT.size)
  const equal = shared === aT.size && aT.size === bT.size
  return { shared, score, matched: shared >= SYNC_MIN_SHARED || (score >= SYNC_OVERLAP_RATIO && equal) }
}

export interface SyncCheckboxesResult {
  content: string
  flaggedVerification: string[]
}

/**
 * Sync checkboxes to todos by token overlap (indented lines sync too, though
 * Task 2 counting ignores them). Best overlap wins, ties go first. Checked
 * boxes never uncheck ([ ] → [x] only); unmatched lines keep state.
 */
export function syncCheckboxesDetailed(
  content: string,
  todos: Array<{ content: string; status: string }>,
): SyncCheckboxesResult {
  const completedStatuses = new Set(["completed", "cancelled", "deleted"])
  const flaggedVerification: string[] = []
  const synced = content.replace(
    /^(\s*[-*]\s*)\[([ xX])\]\s*(.*)$/gm,
    (_match: string, prefix: string, current: string, text: string) => {
      let best: { content: string; status: string } | undefined
      let bestShared = 0
      for (const t of todos) {
        const { shared, matched } = checkboxOverlap(text, t.content)
        if (matched && shared > bestShared) {
          best = t
          bestShared = shared
        }
      }
      // No matching todo → preserve state (never revert manual marks);
      // verification-style leftovers are flagged, never force-completed.
      if (best === undefined) {
        if (current === " " && isVerificationStyle(text)) flaggedVerification.push(text)
        return `${prefix}[${current}] ${text}`
      }
      // Only check, never uncheck: a checked box stays checked
      const done = completedStatuses.has(best.status) || current.toLowerCase() === "x"
      return `${prefix}[${done ? "x" : " "}] ${text}`
    },
  )
  return { content: synced, flaggedVerification }
}

/** String-only wrapper (backward compatible with plan-persister hook). */
export function syncCheckboxes(
  content: string,
  todos: Array<{ content: string; status: string }>,
): string {
  return syncCheckboxesDetailed(content, todos).content
}

/**
 * Append or replace the <!-- plan-persister: ... --> metadata comment.
 *
 * If a comment already exists at the end of the file, it is replaced in-place.
 * Otherwise, the tag is appended after the last line.
 */
export function upsertMetadataComment(content: string, meta: PlanMeta): string {
  const json = JSON.stringify(meta)
  const tag = `${META_TAG_PREFIX} ${json} ${META_TAG_SUFFIX}`

  // Escape regex special chars in the prefix
  const escapedPrefix = META_TAG_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const escapedSuffix = META_TAG_SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(`${escapedPrefix}\\s*[^>]*?\\s*${escapedSuffix}`, "g")

  if (regex.test(content)) {
    return content.replace(regex, tag)
  }

  // Append: strip trailing whitespace, add blank line, then tag
  return `${content.replace(/\n*$/, "")}\n\n${tag}\n`
}

/**
 * Extract PlanMeta from an HTML comment, or null if absent/malformed.
 */
export function parseMetadataComment(content: string): PlanMeta | null {
  const escapedPrefix = META_TAG_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const escapedSuffix = META_TAG_SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(
    `${escapedPrefix}\\s*([^>]+?)\\s*${escapedSuffix}`,
  )
  const match = content.match(regex)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1]) as PlanMeta
    return parsed
  } catch {
    return null
  }
}
