import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { z } from "zod"
import { log } from "../../shared"
import { TASK_TTL_MS } from "./constants"
import type { BackgroundTask } from "./types"

/**
 * File-backed handle index for background tasks.
 *
 * Mirrors the `task-storage` pattern: one file per handle under a
 * project-scoped `.matrixx/bg-handles/` directory, written atomically via
 * `tmp + renameSync`. Only a lightweight index is persisted — prompts,
 * progress, results, errors and tool-call windows stay ephemeral.
 *
 * This lets a freshly-created `BackgroundManager` recover previously-created
 * `bg_*` handles after a plugin/process restart.
 */

export const BG_HANDLE_DIR_NAME = "bg-handles"
export const BG_HANDLE_FILE_PREFIX = "bg_"

export const BgHandleSchema = z
  .object({
    taskId: z.string(),
    parentSessionID: z.string(),
    parentMessageID: z.string(),
    description: z.string(),
    agent: z.string(),
    status: z.enum(["pending", "running", "completed", "error", "cancelled", "interrupt"]),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
        variant: z.string().optional(),
        temperature: z.number().optional(),
      })
      .optional(),
    category: z.string().optional(),
    concurrencyGroup: z.string().optional(),
    queuedAt: z.number().optional(),
    startedAt: z.number().optional(),
    completedAt: z.number().optional(),
  })
  .strict()

export type BgHandle = z.infer<typeof BgHandleSchema>

/** Project-scoped handle directory: `<project>/.matrixx/bg-handles`. */
export function getBgHandleDir(directory: string): string {
  return join(directory, ".matrixx", BG_HANDLE_DIR_NAME)
}

/** One file per handle id: `<project>/.matrixx/bg-handles/<taskId>.json`. */
export function getHandlePath(directory: string, taskId: string): string {
  return join(getBgHandleDir(directory), `${taskId}.json`)
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

/** Project a full task onto the lightweight, persistable handle index. */
export function toHandle(task: BackgroundTask): BgHandle {
  return {
    taskId: task.id,
    parentSessionID: task.parentSessionID,
    parentMessageID: task.parentMessageID,
    description: task.description,
    agent: task.agent,
    status: task.status,
    model: task.model,
    category: task.category,
    concurrencyGroup: task.concurrencyGroup,
    queuedAt: task.queuedAt?.getTime(),
    startedAt: task.startedAt?.getTime(),
    completedAt: task.completedAt?.getTime(),
  }
}

/**
 * Atomically persist a handle: write to a temp file then rename into place.
 * Throws on write failure; callers decide how to surface it.
 */
export function writeHandle(directory: string, task: BackgroundTask): void {
  const filePath = getHandlePath(directory, task.id)
  ensureDir(dirname(filePath))

  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`

  try {
    writeFileSync(tempPath, JSON.stringify(toHandle(task), null, 2), "utf-8")
    renameSync(tempPath, filePath)
  } catch (error) {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath)
      }
    } catch {
      // Ignore cleanup errors — the original write error is the signal.
    }
    throw error
  }
}

function readHandleFile(filePath: string): BgHandle | null {
  try {
    if (!existsSync(filePath)) {
      return null
    }

    const parsed = JSON.parse(readFileSync(filePath, "utf-8"))
    const result = BgHandleSchema.safeParse(parsed)

    return result.success ? result.data : null
  } catch {
    return null
  }
}

/** Read and validate every persisted handle. Invalid/corrupt files are skipped. */
export function readHandles(directory: string): BgHandle[] {
  const dir = getBgHandleDir(directory)
  if (!existsSync(dir)) {
    return []
  }

  const handles: BgHandle[] = []
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(BG_HANDLE_FILE_PREFIX) || !name.endsWith(".json")) {
      continue
    }

    const handle = readHandleFile(join(dir, name))
    if (handle) {
      handles.push(handle)
    }
  }

  return handles
}

/** Remove the handle file for a task id. Returns true when a file was deleted. */
export function deleteHandleFile(directory: string, taskId: string): boolean {
  const filePath = getHandlePath(directory, taskId)

  try {
    if (!existsSync(filePath)) {
      return false
    }

    unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Bounded TTL sweep: delete handle files whose most recent timestamp is older
 * than `ttlMs` (default 30 min). Corrupt/unreadable files are swept too so the
 * directory cannot grow without bound. Returns the number of files removed.
 */
export function sweepStaleHandles(directory: string, ttlMs = TASK_TTL_MS, now = Date.now()): number {
  const dir = getBgHandleDir(directory)
  if (!existsSync(dir)) {
    return 0
  }

  let removed = 0
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(BG_HANDLE_FILE_PREFIX) || !name.endsWith(".json")) {
      continue
    }

    const filePath = join(dir, name)
    const handle = readHandleFile(filePath)
    const timestamp = handle?.completedAt ?? handle?.startedAt ?? handle?.queuedAt

    if (handle && timestamp !== undefined && now - timestamp <= ttlMs) {
      continue
    }

    try {
      unlinkSync(filePath)
      removed++
    } catch {
      // Ignore individual unlink failures — sweep is best-effort and bounded.
    }
  }

  if (removed > 0) {
    log(`[bg-handles] Swept ${removed} stale handle file(s) from ${dir}`)
  }

  return removed
}
