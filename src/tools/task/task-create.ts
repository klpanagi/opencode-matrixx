import type { PluginInput } from "@opencode-ai/plugin";
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool";
import { z } from "zod";
import type { MatrixxConfig } from "../../config/schema";
import {
  acquireLockWithRetry,
  getTaskDir,
  migrateLegacyTasksIfNeeded,
} from "../../features/task-storage/storage";
import { maybeSyncTaskToPlans } from "../../hooks/plan-persister/task-sync";
import { log } from "../../shared/logger";
import { createOneTask } from "./create-one";
import type {
  CreatedTaskSummary,
  TaskCreateInput,
  TaskCreateItemError,
  TaskObject,
} from "./types";
import { TaskCreateBatchInputSchema, TaskCreateInputSchema } from "./types";

type ParseOutcome =
  | { mode: "invalid"; message: string }
  | { mode: "single"; input: TaskCreateInput }
  | { mode: "batch"; items: TaskCreateInput[]; errors: TaskCreateItemError[] }

const SINGLE_TASK_KEYS = Object.keys(TaskCreateInputSchema.shape)
const BATCH_KEYS = Object.keys(TaskCreateBatchInputSchema.shape)

export function createTaskCreateTool(
  config: Partial<MatrixxConfig>,
  ctx?: PluginInput,
): ToolDefinition {
  return tool({
    description: `[TRACKING — local progress record only. Spawns nothing, executes nothing.]
Create a new task with auto-generated ID and threadID recording.

Auto-generates T-{uuid} ID, records threadID from context, sets status to "pending".
Always returns the same envelope: { tasks: [{ id, subject }], errors: [{ index, message }] }.

**BATCH FORM:** pass \`items\` (a non-empty array) instead of the top-level fields to
create several tasks in one call. Items are processed in order, so a repeated subject
inside one batch deduplicates against the item before it. An item that fails validation
fails alone: it lands in \`errors\` with its \`index\` and the rest still create.
\`status\` is NOT accepted here — use task_update to change status.

**IMPORTANT - Dependency Planning for Parallel Execution:**
Use \`blockedBy\` to specify task IDs that must complete before this task can start.
Calculate dependencies carefully to maximize parallel execution:
- Tasks with no dependencies can run simultaneously
- Only block a task if it truly depends on another's output
- Minimize dependency chains to reduce sequential bottlenecks

Do NOT confuse with the task tool ([DELEGATION]): task_create only records a checklist item — it does NOT spawn an agent and no work gets done. To have another agent do work, use task (with category/subagent_type).`,
    args: {
      subject: tool.schema.string().optional().describe("Task subject (required outside batch form)"),
      description: tool.schema.string().optional().describe("Task description"),
      activeForm: tool.schema.string().optional().describe("Active form (present continuous)"),
      metadata: tool.schema
        .record(tool.schema.string(), tool.schema.unknown())
        .optional()
        .describe("Task metadata"),
      blockedBy: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Task IDs blocking this task"),
      blocks: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Task IDs this task blocks"),
      repoURL: tool.schema.string().optional().describe("Repository URL"),
      parentID: tool.schema.string().optional().describe("Parent task ID"),
      priority: tool.schema
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Importance marker stored with the task; no reader acts on it yet"),
      items: tool.schema
        .array(
          tool.schema.object({
            subject: tool.schema.string(),
            description: tool.schema.string().optional(),
            activeForm: tool.schema.string().optional(),
            metadata: tool.schema.record(tool.schema.string(), tool.schema.unknown()).optional(),
            blockedBy: tool.schema.array(tool.schema.string()).optional(),
            blocks: tool.schema.array(tool.schema.string()).optional(),
            repoURL: tool.schema.string().optional(),
            parentID: tool.schema.string().optional(),
            priority: tool.schema.enum(["low", "medium", "high"]).optional(),
          }),
        )
        .optional()
        .describe("Batch form: one entry per task to create, processed in order"),
    },
    execute: async (args, context) => {
      return handleCreate(args, config, ctx, context);
    },
  });
}

function parseCreateArgs(args: Record<string, unknown>): ParseOutcome {
  if (Object.hasOwn(args, "items")) {
    const unknownKey = Object.keys(args).find((key) => !BATCH_KEYS.includes(key));
    if (unknownKey) {
      return { mode: "invalid", message: `Unrecognized key in batch form: ${unknownKey}` };
    }
    const parsed = TaskCreateBatchInputSchema.safeParse(args);
    if (!parsed.success) {
      return { mode: "invalid", message: parsed.error.message };
    }
    const items: TaskCreateInput[] = [];
    const errors: TaskCreateItemError[] = [];
    parsed.data.items.forEach((item, index) => {
      const result = TaskCreateInputSchema.safeParse(item);
      if (result.success) {
        items.push(result.data);
      } else {
        errors.push({ index, message: result.error.message });
      }
    });
    return { mode: "batch", items, errors };
  }

  const unknownKey = Object.keys(args).find((key) => !SINGLE_TASK_KEYS.includes(key));
  if (unknownKey) {
    return { mode: "invalid", message: `Unrecognized key: ${unknownKey}` };
  }
  const parsed = TaskCreateInputSchema.safeParse(args);
  if (!parsed.success) {
    return { mode: "invalid", message: parsed.error.message };
  }
  return { mode: "single", input: parsed.data };
}

async function handleCreate(
  args: Record<string, unknown>,
  config: Partial<MatrixxConfig>,
  ctx: PluginInput | undefined,
  context: { sessionID: string },
): Promise<string> {
  try {
    const parsed = parseCreateArgs(args)
    if (parsed.mode === "invalid") {
      return JSON.stringify({ error: "validation_error", message: parsed.message })
    }

    const directory =
      ((context as Record<string, unknown>)?.directory as string | undefined) ??
      ((ctx as Record<string, unknown>)?.directory as string | undefined) ??
      process.cwd()

    try {
      migrateLegacyTasksIfNeeded(config, directory)
    } catch (error) {
      log(`[task-create] Legacy task migration failed, task creation continues`, {
        directory,
        error: String(error),
      })
    }

    const taskDir = getTaskDir(config, directory)
    const lock = await acquireLockWithRetry(taskDir)
    if (!lock.acquired) {
      return JSON.stringify({ error: "task_lock_unavailable" })
    }

    const inputs = parsed.mode === "batch" ? parsed.items : [parsed.input]
    const errors: TaskCreateItemError[] = parsed.mode === "batch" ? [...parsed.errors] : []
    const tasks: CreatedTaskSummary[] = []
    const created: TaskObject[] = []

    try {
      for (const input of inputs) {
        const one = createOneTask({ input, taskDir, directory, threadID: context.sessionID })
        if (one.outcome === "created") {
          created.push(one.task)
          tasks.push({ id: one.task.id, subject: one.task.subject })
        } else {
          tasks.push({ id: one.id, subject: one.subject, deduplicated: true })
        }
      }
    } finally {
      lock.release();
    }

    for (const task of created) {
      try {
        await maybeSyncTaskToPlans({ directory, task, config })
      } catch (error) {
        log(`[task-create] Plan sync failed, task kept`, { id: task.id, error: String(error) })
      }
    }

    return JSON.stringify({ tasks, errors });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return JSON.stringify({ error: "validation_error", message: error.message });
    }
    return JSON.stringify({ error: "internal_error" });
  }
}
