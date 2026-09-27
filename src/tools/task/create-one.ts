import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import {
  generateTaskId,
  readJsonSafe,
  writeJsonAtomic,
} from "../../features/task-storage/storage"
import { log } from "../../shared/logger"
import { DEDUP_WINDOW_MS } from "./constants"
import type { TaskCreateInput, TaskObject } from "./types"
import { TaskObjectSchema } from "./types"

export type CreateOneResult =
  | { outcome: "created"; task: TaskObject }
  | { outcome: "deduplicated"; id: string; subject: string }

export interface CreateOneOptions {
  input: TaskCreateInput
  taskDir: string
  directory: string
  threadID: string
}

/**
 * The caller owns the storage lock. This reads and writes one task and nothing
 * else, so a batch can call it strictly sequentially and have item N's write
 * already on disk when item N+1 runs its dedup scan.
 */
export function createOneTask(options: CreateOneOptions): CreateOneResult {
  const { input, taskDir, directory, threadID } = options

  const existingTask = findDuplicateTask(taskDir, input.subject, directory)
  if (existingTask) {
    return { outcome: "deduplicated", id: existingTask.id, subject: existingTask.subject }
  }

  const validatedTask = TaskObjectSchema.parse({
    id: generateTaskId(),
    subject: input.subject,
    description: input.description ?? "",
    status: "pending",
    blocks: input.blocks ?? [],
    blockedBy: input.blockedBy ?? [],
    activeForm: input.activeForm,
    metadata: input.metadata,
    repoURL: input.repoURL,
    parentID: input.parentID,
    priority: input.priority,
    threadID,
    projectRoot: directory,
  })

  writeJsonAtomic(join(taskDir, `${validatedTask.id}.json`), validatedTask)
  return { outcome: "created", task: validatedTask }
}

function findDuplicateTask(
  taskDir: string,
  subject: string,
  directory: string,
): TaskObject | null {
  let files: string[]
  try {
    files = readdirSync(taskDir).filter((f) => f.endsWith(".json") && f.startsWith("T-"))
  } catch (error) {
    log(`[task-create] Failed to list task dir ${taskDir} during dedup scan`, error)
    return null
  }

  for (const file of files) {
    const filePath = join(taskDir, file)
    let existing: TaskObject | null
    try {
      existing = readJsonSafe(filePath, TaskObjectSchema)
    } catch (error) {
      log(`[task-create] Failed to read task file ${filePath} during dedup scan`, error)
      continue
    }
    if (!existing) continue

    const isActive = existing.status === "pending" || existing.status === "in_progress"
    if (!isActive) continue
    if (existing.subject.trim() !== subject.trim()) continue
    if (existing.projectRoot !== directory) continue

    let mtimeMs: number
    try {
      mtimeMs = statSync(filePath).mtimeMs
    } catch (error) {
      log(`[task-create] Failed to stat task file ${filePath} during dedup scan`, error)
      continue
    }
    if (Date.now() - mtimeMs > DEDUP_WINDOW_MS) continue

    return existing
  }

  return null
}
