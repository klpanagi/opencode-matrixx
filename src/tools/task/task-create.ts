import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool";
import { z } from "zod";
import type { MatrixxConfig } from "../../config/schema";
import {
  acquireLockWithRetry,
  generateTaskId,
  getTaskDir,
  migrateLegacyTasksIfNeeded,
  readJsonSafe,
  writeJsonAtomic,
} from "../../features/task-storage/storage";
import { maybeSyncTaskToPlans } from "../../hooks/plan-persister/task-sync";
import { log } from "../../shared/logger";
import { DEDUP_WINDOW_MS } from "./constants";
import type { TaskObject } from "./types";
import { TaskCreateInputSchema, TaskObjectSchema } from "./types";

export function createTaskCreateTool(
  config: Partial<MatrixxConfig>,
  ctx?: PluginInput,
): ToolDefinition {
   return tool({
     description: `[TRACKING — local progress record only. Spawns nothing, executes nothing.]
Create a new task with auto-generated ID and threadID recording.

Auto-generates T-{uuid} ID, records threadID from context, sets status to "pending".
Returns minimal response with task ID and subject.

**IMPORTANT - Dependency Planning for Parallel Execution:**
Use \`blockedBy\` to specify task IDs that must complete before this task can start.
Calculate dependencies carefully to maximize parallel execution:
- Tasks with no dependencies can run simultaneously
- Only block a task if it truly depends on another's output
- Minimize dependency chains to reduce sequential bottlenecks

Do NOT confuse with the task tool ([DELEGATION]): task_create only records a checklist item — it does NOT spawn an agent and no work gets done. To have another agent do work, use task (with category/subagent_type).`,
     args: {
      subject: tool.schema.string().describe("Task subject (required)"),
      description: tool.schema.string().optional().describe("Task description"),
      activeForm: tool.schema
        .string()
        .optional()
        .describe("Active form (present continuous)"),
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
    },
    execute: async (args, context) => {
      return handleCreate(args, config, ctx, context);
    },
  });
}

async function handleCreate(
  args: Record<string, unknown>,
  config: Partial<MatrixxConfig>,
  ctx: PluginInput | undefined,
  context: { sessionID: string },
): Promise<string> {
  try {
    const validatedArgs = TaskCreateInputSchema.parse(args)
    const directory =
      ((context as Record<string, unknown>)?.directory as string | undefined) ??
      ((ctx as Record<string, unknown>)?.directory as string | undefined) ??
      process.cwd()
    try {
      migrateLegacyTasksIfNeeded(config, directory)
    } catch {}
    const taskDir = getTaskDir(config, directory)
    const lock = await acquireLockWithRetry(taskDir)

    if (!lock.acquired) {
      return JSON.stringify({ error: "task_lock_unavailable" })
    }

    let created: TaskObject | null = null
    try {
      const existingTask = findDuplicateTask(taskDir, validatedArgs.subject, directory)
      if (existingTask) {
        return JSON.stringify({
          task: { id: existingTask.id, subject: existingTask.subject },
          deduplicated: true,
        })
      }

      const taskId = generateTaskId();
      const task: TaskObject = {
        id: taskId,
        subject: validatedArgs.subject,
        description: validatedArgs.description ?? "",
        status: "pending",
        blocks: validatedArgs.blocks ?? [],
        blockedBy: validatedArgs.blockedBy ?? [],
        activeForm: validatedArgs.activeForm,
        metadata: validatedArgs.metadata,
        repoURL: validatedArgs.repoURL,
        parentID: validatedArgs.parentID,
        threadID: context.sessionID,
        projectRoot: directory,
      };

      const validatedTask = TaskObjectSchema.parse(task);
      writeJsonAtomic(join(taskDir, `${taskId}.json`), validatedTask);
      created = validatedTask;
    } finally {
      lock.release();
    }

    // Completion path (post-lock): no-op for fresh pending tasks, live for
    // any future terminal-on-create flow. Never breaks task creation.
    if (created !== null) {
      try {
        await maybeSyncTaskToPlans({ directory, task: created, config });
      } catch (error) {
        log(`[task-create] Plan sync failed, task kept`, { id: created.id, error: String(error) });
      }
      return JSON.stringify({
        task: {
          id: created.id,
          subject: created.subject,
        },
      });
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
