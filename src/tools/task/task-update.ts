import { join } from "node:path";
import { z } from "zod";
import type { MatrixxConfig } from "../../config/schema";
import {
  acquireLockWithRetry,
  getTaskDir,
  readJsonSafe,
  writeJsonAtomic,
} from "../../features/task-storage/storage";
import { maybeSyncTaskToPlans } from "../../hooks/plan-persister/task-sync";
import type { V2ToolDefinition } from "../../plugin/types"
import { log } from "../../shared/logger";
import { TASK_ID_PATTERN } from "./constants";
import type { TaskObject } from "./types";
import { TaskObjectSchema, TaskUpdateInputSchema } from "./types";

function parseTaskId(id: string): string | null {
  if (!TASK_ID_PATTERN.test(id)) return null;
  return id;
}

export function createTaskUpdateTool(
  config: Partial<MatrixxConfig>,
  ctx?: { directory?: string },
): V2ToolDefinition {
   return {
     name: "task_update",
     description: `[TRACKING — local progress record only. Spawns nothing, executes nothing.]
Update an existing task with new values.

Supports updating: subject, description, status, activeForm, owner, metadata.
For blocks/blockedBy: use addBlocks/addBlockedBy to append (additive, not replacement).

**IMPORTANT - Dependency Management:**
Use \`addBlockedBy\` to declare dependencies on other tasks.
Properly managed dependencies enable maximum parallel execution.`,
     input: z.object({
      id: z.string().describe("Task ID (required)"),
      subject: z.string().optional().describe("Task subject"),
      description: z.string().optional().describe("Task description"),
      status: z
        .enum(["pending", "in_progress", "completed", "deleted"])
        .optional()
        .describe("Task status"),
      activeForm: z
        .string()
        .optional()
        .describe("Active form (present continuous)"),
      owner: z
        .string()
        .optional()
        .describe("Task owner (agent name)"),
      addBlocks: z
        .array(z.string())
        .optional()
        .describe("Task IDs to add to blocks (additive, not replacement)"),
      addBlockedBy: z
        .array(z.string())
        .optional()
        .describe("Task IDs to add to blockedBy (additive, not replacement)"),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Task metadata to merge (set key to null to delete)"),
    }),
    execute: async (args, context) => {
      return { content: await (handleUpdate(args, config, ctx, context)) };
    },
  };
}

async function handleUpdate(
  args: Record<string, unknown>,
  config: Partial<MatrixxConfig>,
  ctx: { directory?: string } | undefined,
  context: { sessionID: string },
): Promise<string> {
  try {
    const validatedArgs = TaskUpdateInputSchema.parse(args);
    const taskId = parseTaskId(validatedArgs.id);
    if (!taskId) {
      return JSON.stringify({ error: "invalid_task_id" });
    }

    const directory =
      ((context as unknown as { directory?: string })?.directory as string | undefined) ??
      ((ctx as unknown as { directory?: string })?.directory as string | undefined) ??
      process.cwd()
    const taskDir = getTaskDir(config, directory)
    const lock = await acquireLockWithRetry(taskDir)

    if (!lock.acquired) {
      return JSON.stringify({ error: "task_lock_unavailable" })
    }

    let updated: TaskObject | null = null
    try {
      const taskPath = join(taskDir, `${taskId}.json`);
      const task = readJsonSafe(taskPath, TaskObjectSchema);

      if (!task) {
        return JSON.stringify({ error: "task_not_found" });
      }

      if (validatedArgs.subject !== undefined) {
        task.subject = validatedArgs.subject;
      }
      if (validatedArgs.description !== undefined) {
        task.description = validatedArgs.description;
      }
      if (validatedArgs.status !== undefined) {
        task.status = validatedArgs.status;
      }
      if (validatedArgs.activeForm !== undefined) {
        task.activeForm = validatedArgs.activeForm;
      }
      if (validatedArgs.owner !== undefined) {
        task.owner = validatedArgs.owner;
      }

      const addBlocks = validatedArgs.addBlocks;
      if (addBlocks) {
        task.blocks = [...new Set([...task.blocks, ...addBlocks])];
      }

      const addBlockedBy = validatedArgs.addBlockedBy;
      if (addBlockedBy) {
        task.blockedBy = [...new Set([...task.blockedBy, ...addBlockedBy])];
      }

      if (validatedArgs.metadata !== undefined) {
        task.metadata = { ...task.metadata, ...validatedArgs.metadata };
        Object.keys(task.metadata).forEach((key) => {
          if (task.metadata?.[key] === null) {
            delete task.metadata[key];
          }
        });
      }

      const validatedTask = TaskObjectSchema.parse(task);
      writeJsonAtomic(taskPath, validatedTask);
      updated = validatedTask;
    } finally {
      lock.release();
    }

    if (updated !== null) {
      try {
        await maybeSyncTaskToPlans({ directory, task: updated, config });
      } catch (error) {
        log(`[task-update] Plan sync failed, task update kept`, { id: taskId, error: String(error) });
      }
      return JSON.stringify({ task: updated });
    }
    return JSON.stringify({ error: "internal_error" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return JSON.stringify({
        error: "validation_error",
        message: error.message,
      });
    }
    return JSON.stringify({ error: "internal_error" });
  }
}
