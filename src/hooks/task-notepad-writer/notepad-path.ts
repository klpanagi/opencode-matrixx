import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import type { PluginInput } from "@opencode-ai/plugin"
import type { MatrixxConfig } from "../../config/schema"
import {
  ADHOC_BUCKET,
  MATRIXX_DIR_NAME,
  NOTEPAD_EXTENSION,
  NOTEPADS_SUBDIR,
  PLAN_EXTENSION,
  PLAN_NAME_METADATA_KEY,
  PLANS_SUBDIR,
  SLUG_MAX_LENGTH,
  taskIdMarkerPresent,
} from "./constants"

export type TaskNotepadWriterContext = PluginInput & {
  config?: Partial<MatrixxConfig>
}

export interface NotepadTask {
  id: string
  subject: string
  metadata?: Record<string, unknown> | undefined
  status?: string | undefined
  priority?: string | undefined
}

export type BucketReason = "plan-file-exists" | "no-plan-name" | "plan-file-missing"

export interface NotepadResolution {
  bucketDir: string
  filePath: string
  reason: BucketReason
}

export function notepadsRootFor(directory: string): string {
  return join(directory, MATRIXX_DIR_NAME, NOTEPADS_SUBDIR)
}

export function extractPlanName(task: NotepadTask): string | null {
  const raw = task.metadata?.[PLAN_NAME_METADATA_KEY]
  return typeof raw === "string" && raw.length > 0 ? raw : null
}

function planFilePath(ctx: TaskNotepadWriterContext, planName: string): string {
  return join(ctx.directory, MATRIXX_DIR_NAME, PLANS_SUBDIR, `${planName}${PLAN_EXTENSION}`)
}

export function slugifySubject(subject: string, fallback: string): string {
  const slug = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-$/, "")
  return slug.length > 0 ? slug : fallback
}

export function countNotepadFiles(bucketDir: string): number {
  if (!existsSync(bucketDir)) return 0
  try {
    return readdirSync(bucketDir).filter((entry) => entry.endsWith(NOTEPAD_EXTENSION)).length
  } catch {
    return 0
  }
}

export function resolveNotepadPath(input: {
  ctx: TaskNotepadWriterContext
  task: NotepadTask
  notepadRoot: string
}): NotepadResolution {
  const { ctx, task, notepadRoot } = input
  const planName = extractPlanName(task)

  const usePlanBucket = planName !== null && existsSync(planFilePath(ctx, planName))
  const bucket = usePlanBucket ? planName : ADHOC_BUCKET
  const reason: BucketReason = !planName
    ? "no-plan-name"
    : usePlanBucket
      ? "plan-file-exists"
      : "plan-file-missing"

  const bucketDir = join(notepadRoot, bucket)
  const index = countNotepadFiles(bucketDir)
  const slug = slugifySubject(task.subject, task.id)
  return { bucketDir, filePath: join(bucketDir, `${index}-${slug}${NOTEPAD_EXTENSION}`), reason }
}

export function findExistingNotepadForTask(
  bucketDir: string,
  taskId: string,
): string | null {
  if (!existsSync(bucketDir)) return null
  let entries: string[]
  try {
    entries = readdirSync(bucketDir).filter((entry) => entry.endsWith(NOTEPAD_EXTENSION))
  } catch {
    return null
  }
  for (const entry of entries) {
    const fullPath = join(bucketDir, entry)
    try {
      if (taskIdMarkerPresent(readFileSync(fullPath, "utf-8"), taskId)) return fullPath
    } catch {
    }
  }
  return null
}

export function findNotepadForTask(input: {
  ctx: TaskNotepadWriterContext
  task: NotepadTask
  notepadRoot: string
}): { filePath: string; bucketDir: string } | null {
  const buckets = [ADHOC_BUCKET]
  const planName = extractPlanName(input.task)
  if (planName && planName !== ADHOC_BUCKET) buckets.unshift(planName)
  for (const bucket of buckets) {
    const bucketDir = join(input.notepadRoot, bucket)
    const filePath = findExistingNotepadForTask(bucketDir, input.task.id)
    if (filePath) return { filePath, bucketDir }
  }
  return null
}
