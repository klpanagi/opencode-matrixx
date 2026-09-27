import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { getTaskDir, readJsonSafe } from "../../features/task-storage/storage"
import { log } from "../../shared/logger"
import { TaskObjectSchema } from "../../tools/task/types"
import {
  COMPLETED_STATUS,
  COMPLETION_SECTION_TITLE,
  HOOK_NAME,
  renderCompletionStamp,
  renderNotepad,
  TASK_CREATE_TOOL,
  TASK_UPDATE_TOOL,
} from "./constants"
import {
  findNotepadForTask,
  type NotepadTask,
  notepadsRootFor,
  resolveNotepadPath,
  type TaskNotepadWriterContext,
} from "./notepad-path"

type Json = Record<string, unknown>

export interface ToolAfterInput {
  tool: string
  sessionID: string
  callID: string
}

export interface ToolAfterOutput {
  title: string
  output: string
  metadata?: Record<string, unknown>
}

export function createTaskNotepadWriterHook(ctx: TaskNotepadWriterContext) {
  const notepadRoot = notepadsRootFor(ctx.directory)

  return {
    "tool.execute.after": async (
      input: ToolAfterInput,
      output: ToolAfterOutput | undefined,
    ): Promise<void> => {
      if (!output) return
      const payload = parseJsonObject(output.output)
      if (!payload) return

      if (input.tool === TASK_CREATE_TOOL) {
        await handleCreate(ctx, notepadRoot, payload)
        return
      }
      if (input.tool === TASK_UPDATE_TOOL) {
        await handleUpdate(ctx, notepadRoot, payload)
        return
      }
    },
  }
}

async function handleCreate(
  ctx: TaskNotepadWriterContext,
  notepadRoot: string,
  payload: Json,
): Promise<void> {
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : []
  for (const entry of tasks) {
    const created = toCreatedTask(entry)
    if (!created) continue
    if (created.deduplicated) {
      log(`[${HOOK_NAME}] create deduplicated, no notepad written`, { id: created.id })
      continue
    }
    // Asymmetry: the task_create envelope carries only { id, subject } — no
    // status and no metadata — so metadata.planName (and therefore the bucket)
    // is only reachable through a read of the file-backed task store.
    const stored = readStoredTask(ctx, created.id)
    if (!stored) {
      log(`[${HOOK_NAME}] task not in store yet, no notepad written`, { id: created.id })
      continue
    }
    const existing = findNotepadForTask({ ctx, task: stored, notepadRoot })
    if (existing) {
      log(`[${HOOK_NAME}] notepad already present`, { id: created.id, file: existing.filePath })
      continue
    }
    const { bucketDir, filePath, reason } = resolveNotepadPath({ ctx, task: stored, notepadRoot })
    mkdirSync(bucketDir, { recursive: true })
    writeFileSync(
      filePath,
      renderNotepad({
        subject: stored.subject,
        taskId: stored.id,
        priority: stored.priority,
        status: stored.status,
        startedAt: new Date().toISOString(),
      }),
      "utf-8",
    )
    log(`[${HOOK_NAME}] created notepad`, { id: created.id, bucket: reason, file: filePath })
  }
}

async function handleUpdate(
  ctx: TaskNotepadWriterContext,
  notepadRoot: string,
  payload: Json,
): Promise<void> {
  const task = toNotepadTask(payload.task)
  if (!task) return
  if (readString(task, "status") !== COMPLETED_STATUS) return

  // task_update returns the full TaskObject, so metadata is inline when present;
  // the store read is the fallback for the case where it is not.
  const withMetadata: NotepadTask =
    task.metadata !== undefined ? task : readStoredTask(ctx, readString(task, "id") ?? "") ?? task
  const existing = findNotepadForTask({ ctx, task: withMetadata, notepadRoot })
  if (!existing) {
    log(`[${HOOK_NAME}] completed task has no notepad, nothing stamped`, {
      id: readString(task, "id") ?? "unknown",
    })
    return
  }
  const content = readFileSync(existing.filePath, "utf-8")
  if (content.includes(COMPLETION_SECTION_TITLE)) return
  writeFileSync(
    existing.filePath,
    `${content}${renderCompletionStamp(new Date().toISOString())}`,
    "utf-8",
  )
  log(`[${HOOK_NAME}] stamped completion`, { id: readString(task, "id"), file: existing.filePath })
}

function readStoredTask(ctx: TaskNotepadWriterContext, taskId: string): NotepadTask | null {
  if (!taskId) return null
  const taskDir = getTaskDir(ctx.config, ctx.directory)
  const stored = readJsonSafe(join(taskDir, `${taskId}.json`), TaskObjectSchema)
  if (!stored) return null
  return {
    id: stored.id,
    subject: stored.subject,
    metadata: stored.metadata,
    status: stored.status,
    priority: stored.priority,
  }
}

function parseJsonObject(raw: string): Json | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
    return parsed as Json
  } catch {
    return null
  }
}

function readString(source: unknown, key: string): string | null {
  if (typeof source !== "object" || source === null) return null
  const value = (source as Json)[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

function toCreatedTask(entry: unknown): (NotepadTask & { deduplicated?: boolean }) | null {
  if (typeof entry !== "object" || entry === null) return null
  const record = entry as Json
  const id = readString(record, "id")
  const subject = readString(record, "subject")
  if (!id || !subject) return null
  const deduplicated = record.deduplicated === true
  return deduplicated ? { id, subject, deduplicated } : { id, subject }
}

function toNotepadTask(value: unknown): (NotepadTask & { status?: string }) | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Json
  const id = readString(record, "id")
  if (!id) return null
  const subject = readString(record, "subject") ?? id
  const metadata = record.metadata
  const status = readString(record, "status")
  return {
    id,
    subject,
    ...(typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
      ? { metadata: metadata as Record<string, unknown> }
      : {}),
    ...(status ? { status } : {}),
  }
}
