import { existsSync, readdirSync } from "node:fs";
import type { PluginInput } from "@opencode-ai/plugin";
import type { MatrixxConfig } from "../../config/schema";
import { getTaskDir, readJsonSafe } from "../../features/task-storage/storage";
import type { Task } from "../../features/task-storage/types";
import { log } from "../../shared/logger";
import { isTaskSystemEnabled } from "../../shared/task-system-gating";
import { syncAllTasksToTodos } from "../../tools/task/todo-sync";
import { TaskObjectSchema } from "../../tools/task/types";
import { DEBOUNCE_MS, HOOK_NAME } from "./constants";

type TodoSyncCtx = PluginInput;

function loadAllTasks(pluginConfig: MatrixxConfig): Task[] {
  try {
    const dir = getTaskDir(pluginConfig);
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f.startsWith("T-"));
    const tasks: Task[] = [];
    for (const file of files) {
      const task = readJsonSafe(`${dir}/${file}`, TaskObjectSchema);
      if (task) tasks.push(task as Task);
    }
    return tasks;
  } catch (err) {
    log(`[${HOOK_NAME}] Failed to load tasks`, { error: String(err) });
    return [];
  }
}

export function createTaskTodoMirrorHook(
  ctx: TodoSyncCtx,
  pluginConfig: MatrixxConfig,
) {
  const enabled = isTaskSystemEnabled(pluginConfig)
  const pending = new Map<string, ReturnType<typeof setTimeout>>()
  const lastSync = new Map<string, number>()

  const flushSession = async (sessionID: string): Promise<void> => {
    if (!enabled) return
    if (!sessionID) return
    lastSync.set(sessionID, Date.now())
    try {
      const tasks = loadAllTasks(pluginConfig)
      await syncAllTasksToTodos(ctx, tasks, sessionID)
      log(`[${HOOK_NAME}] Synced ${tasks.length} tasks to session`, { sessionID })
    } catch (err) {
      pending.delete(sessionID)
      log(`[${HOOK_NAME}] Sync failed`, { sessionID, error: String(err) })
    }
  }

  const syncForSession = async (sessionID: string | undefined): Promise<void> => {
    if (!enabled) return
    if (!sessionID) return
    const pendingTimer = pending.get(sessionID)
    if (pendingTimer) clearTimeout(pendingTimer)
    const last = lastSync.get(sessionID) ?? 0
    const elapsed = Date.now() - last
    if (elapsed >= DEBOUNCE_MS && !pendingTimer) {
      await flushSession(sessionID)
      return
    }
    pending.set(
      sessionID,
      setTimeout(() => {
        pending.delete(sessionID)
        void flushSession(sessionID)
      }, DEBOUNCE_MS),
    )
  }

  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      _output: { title: string; output: string; metadata: Record<string, unknown> } | undefined,
    ): Promise<void> => {
      if (!enabled) return;
      await syncForSession(input.sessionID);
    },

    "chat.message": async (
      input: { sessionID: string; agent?: string; model?: { providerID: string; modelID: string } },
      _output: { message: Record<string, unknown>; parts: Array<{ type: string; text?: string }> },
    ): Promise<void> => {
      if (!enabled) return;
      await syncForSession(input.sessionID);
    },

    "experimental.chat.messages.transform": async (
      _input: Record<string, never>,
      output: { messages: Array<{ info: { sessionID?: string } }> },
    ): Promise<void> => {
      if (!enabled) return;
      let sessionID: string | undefined;
      for (let i = output.messages.length - 1; i >= 0; i--) {
        const id = output.messages[i].info.sessionID;
        if (id) {
          sessionID = id;
          break;
        }
      }
      await syncForSession(sessionID);
    },

    event: async (input: { event: { type: string; properties?: unknown } }): Promise<void> => {
      if (!enabled) return;
      const props = input.event.properties as Record<string, unknown> | undefined;
      const sessionID =
        (props?.sessionID as string | undefined) ??
        ((props?.info as { id?: string } | undefined)?.id as string | undefined);
      if (sessionID && input.event.type === "session.idle") {
        await syncForSession(sessionID);
      }
    },

    // exposed for testing
    _syncForSession: syncForSession,
  };
}
