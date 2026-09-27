import { z } from "zod"
import { TASK_ID_PATTERN } from "./constants"

export const TaskStatusSchema = z.enum(["pending", "in_progress", "completed", "deleted"])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

/** Optional with no default: pre-existing task files must keep loading unmodified. */
export const TaskPrioritySchema = z.enum(["low", "medium", "high"])
export type TaskPriority = z.infer<typeof TaskPrioritySchema>

/** Task ID must match T-{uuid}-style format (rejects truncated IDs like "T-"). */
export const TaskIdSchema = z.string().regex(TASK_ID_PATTERN)

export const TaskObjectSchema = z
  .object({
    id: z.string(),
    subject: z.string(),
    description: z.string(),
    status: TaskStatusSchema,
    activeForm: z.string().optional(),
    blocks: z.array(z.string()).default([]),
    blockedBy: z.array(z.string()).default([]),
    owner: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    repoURL: z.string().optional(),
    parentID: z.string().optional(),
    threadID: z.string(),
    projectRoot: z.string().optional(),
    priority: TaskPrioritySchema.optional(),
  })
  .strict()

export type TaskObject = z.infer<typeof TaskObjectSchema>

// Claude Code style aliases
export const TaskSchema = TaskObjectSchema
export type Task = TaskObject

// Action input schemas
/**
 * Strict on purpose: `status` belongs to `task_update`, and silently dropping a
 * key the caller was told about is how an argument shape drifts from the schema.
 */
export const TaskCreateInputSchema = z
  .object({
    subject: z.string(),
    description: z.string().optional(),
    activeForm: z.string().optional(),
    blocks: z.array(TaskIdSchema).optional(),
    blockedBy: z.array(TaskIdSchema).optional(),
    owner: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    repoURL: z.string().optional(),
    parentID: TaskIdSchema.optional(),
    priority: TaskPrioritySchema.optional(),
  })
  .strict()

export type TaskCreateInput = z.infer<typeof TaskCreateInputSchema>

/**
 * Batch form of `task_create`. A top-level array is unrepresentable: the SDK
 * types `args` as a ZodRawShape (a flat record of zod types) and validates it
 * into a ZodObject before `execute` runs, so a declared `items` key is the only
 * expressible way to create more than one task in a single call.
 *
 * Items are `unknown` here on purpose: each one is validated separately by
 * `TaskCreateInputSchema` so a bad item fails alone instead of failing the call.
 */
export const TaskCreateBatchInputSchema = z
  .object({
    items: z.array(z.unknown()).min(1, "items must contain at least one task"),
  })
  .strict()

export type TaskCreateBatchInput = z.infer<typeof TaskCreateBatchInputSchema>

/** One entry of the `tasks` array in the single, always-present response envelope. */
export type CreatedTaskSummary = {
  id: string
  subject: string
  deduplicated?: boolean
}

/** A batch item that failed validation on its own; `index` is its position in `items`. */
export type TaskCreateItemError = {
  index: number
  message: string
}

export const TaskListInputSchema = z.object({
  status: TaskStatusSchema.optional(),
  parentID: z.string().optional(),
})

export type TaskListInput = z.infer<typeof TaskListInputSchema>

export const TaskGetInputSchema = z.object({
  id: z.string(),
})

export type TaskGetInput = z.infer<typeof TaskGetInputSchema>

export const TaskUpdateInputSchema = z.object({
  id: z.string(),
  subject: z.string().optional(),
  description: z.string().optional(),
  status: TaskStatusSchema.optional(),
  activeForm: z.string().optional(),
  addBlocks: z.array(TaskIdSchema).optional(),
  addBlockedBy: z.array(TaskIdSchema).optional(),
  owner: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  repoURL: z.string().optional(),
  parentID: TaskIdSchema.optional(),
  priority: TaskPrioritySchema.optional(),
})

export type TaskUpdateInput = z.infer<typeof TaskUpdateInputSchema>

export const TaskDeleteInputSchema = z.object({
  id: z.string(),
})

export type TaskDeleteInput = z.infer<typeof TaskDeleteInputSchema>
