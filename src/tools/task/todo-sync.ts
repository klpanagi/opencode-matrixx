import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import { getMainSessionID } from "../../features/session-state/state";
import type { Task } from "../../features/task-storage/types";
import { log } from "../../shared/logger";

export interface TodoInfo {
  id?: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority?: "low" | "medium" | "high";
}

type TodoWriter = (input: {
  sessionID: string;
  todos: TodoInfo[];
}) => Promise<void>;

function mapTaskStatusToTodoStatus(
  taskStatus: Task["status"],
): TodoInfo["status"] | null {
  switch (taskStatus) {
    case "pending":
      return "pending";
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "deleted":
      return null;
    default:
      return "pending";
  }
}

function extractPriority(
  metadata?: Record<string, unknown>,
): TodoInfo["priority"] | undefined {
  if (!metadata) return undefined;

  const priority = metadata.priority;
  if (
    typeof priority === "string" &&
    ["low", "medium", "high"].includes(priority)
  ) {
    return priority as "low" | "medium" | "high";
  }

  return undefined;
}

function todosMatch(todo1: TodoInfo, todo2: TodoInfo): boolean {
  if (todo1.id && todo2.id) {
    return todo1.id === todo2.id;
  }
  return todo1.content === todo2.content;
}

export function syncTaskToTodo(task: Task): TodoInfo | null {
  const todoStatus = mapTaskStatusToTodoStatus(task.status);

  if (todoStatus === null) {
    return null;
  }

  return {
    id: task.id,
    content: task.subject,
    status: todoStatus,
    priority: extractPriority(task.metadata),
  };
}

async function resolveTodoWriter(): Promise<TodoWriter | null> {
  const loaders = ["opencode/session/todo", "@opencode-ai/core/session/todo"];
  for (const loader of loaders) {
    try {
      const mod = await import(loader);
      const update = (mod as { Todo?: { update?: unknown } }).Todo?.update;
      if (typeof update === "function") {
        return update as TodoWriter;
      }
    } catch (err) {
      log("[todo-sync] Failed to resolve Todo.update", { loader, error: String(err) });
    }
  }
  return null;
}

function getOpencodeDbPath(): string | null {
  const candidates: string[] = [];
  if (process.env.XDG_DATA_HOME) {
    candidates.push(join(process.env.XDG_DATA_HOME, "opencode", "opencode.db"));
  }
  candidates.push(join(homedir(), ".local", "share", "opencode", "opencode.db"));
  candidates.push(join(homedir(), ".config", "opencode", "opencode.db"));
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[1] ?? null;
}

async function directDbWrite(sessionID: string, todos: TodoInfo[]): Promise<boolean> {
  const dbPath = getOpencodeDbPath();
  if (!dbPath || !existsSync(dbPath)) {
    log("[todo-sync] directDbWrite no db", { dbPath });
    return false;
  }
  try {
    const mod = await import("bun:sqlite");
    const Database = (mod as unknown as { Database: new (path: string) => unknown }).Database as new (path: string) => {
      exec: (sql: string) => unknown;
      prepare: (sql: string) => { run: (...args: unknown[]) => unknown }
      close: () => void
    };
    const db = new Database(dbPath);
    const now = Date.now();
    try {
      db.exec("BEGIN IMMEDIATE");
      db.prepare("DELETE FROM todo WHERE session_id = ?").run(sessionID);
      const stmt = db.prepare(
        "INSERT INTO todo (session_id, content, status, priority, position, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      todos.forEach((t, idx) => {
        stmt.run(sessionID, t.content, t.status, t.priority ?? "medium", idx, now, now);
      });
      db.exec("COMMIT");
    } catch (inner) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // ignore
      }
      throw inner;
    } finally {
      db.close();
    }
    log("[todo-sync] directDbWrite ok", { sessionID, count: todos.length });
    return true;
  } catch (err) {
    log("[todo-sync] directDbWrite failed", { error: String(err) });
    return false;
  }
}

async function writeTodosWithFallback(
  sessionID: string,
  todos: TodoInfo[],
  writer: TodoWriter | null,
): Promise<void> {
  if (writer) {
    try {
      await writer({ sessionID, todos });
      return;
    } catch (err) {
      log("[todo-sync] writer failed, fallback to direct DB", { error: String(err) });
    }
  }
  const ok = await directDbWrite(sessionID, todos);
  if (!ok) {
    log("[todo-sync] fallback also failed", { sessionID });
  }
}

function extractTodos(response: unknown): TodoInfo[] {
  const payload = response as { data?: unknown };
  if (Array.isArray(payload?.data)) {
    return payload.data as TodoInfo[];
  }
  if (Array.isArray(response)) {
    return response as TodoInfo[];
  }
  return [];
}

export async function syncTaskTodoUpdate(
  ctx: PluginInput | undefined,
  task: Task,
  sessionID: string,
  writer?: TodoWriter,
): Promise<void> {
  if (!ctx) return;
  const resolvedWriter = writer ?? (await resolveTodoWriter());
  await syncSingleSession(ctx, task, sessionID, resolvedWriter);
  const mainSessionID = safeGetMainSessionID();
  if (mainSessionID && mainSessionID !== sessionID) {
    await syncSingleSession(ctx, task, mainSessionID, resolvedWriter);
  }
}

async function syncSingleSession(
  ctx: PluginInput,
  task: Task,
  sessionID: string,
  writer: TodoWriter | null,
): Promise<void> {
  try {
    const response = await ctx.client.session.todo({
      path: { id: sessionID },
    });
    const currentTodos = extractTodos(response);
    const taskTodo = syncTaskToTodo(task);
    const nextTodos = currentTodos.filter((todo) => {
      if (taskTodo) {
        return !todosMatch(todo, taskTodo);
      }
      if (todo.id) {
        return todo.id !== task.id;
      }
      return todo.content !== task.subject;
    });
    if (taskTodo) {
      nextTodos.push(taskTodo);
    }
    if (taskTodo) {
      nextTodos.push(taskTodo);
    }
    await writeTodosWithFallback(sessionID, nextTodos, writer);
  } catch (err) {
    log("[todo-sync] Failed to sync task todo", {
      error: String(err),
      sessionID,
    });
  }
}

function safeGetMainSessionID(): string | undefined {
  try {
    return getMainSessionID();
  } catch {
    return undefined;
  }
}

export async function syncAllTasksToTodos(
  ctx: PluginInput,
  tasks: Task[],
  sessionID?: string,
  writer?: TodoWriter,
): Promise<void> {
  try {
    let currentTodos: TodoInfo[] = [];
    try {
      const response = await ctx.client.session.todo({
        path: { id: sessionID || "" },
      });
      currentTodos = extractTodos(response);
    } catch (err) {
      log("[todo-sync] Failed to fetch current todos", {
        error: String(err),
        sessionID,
      });
    }

    const newTodos: TodoInfo[] = [];
    const tasksToRemove = new Set<string>();
    const allTaskSubjects = new Set<string>();

    for (const task of tasks) {
      allTaskSubjects.add(task.subject);
      const todo = syncTaskToTodo(task);
      if (todo === null) {
        tasksToRemove.add(task.id);
      } else {
        newTodos.push(todo);
      }
    }

    const finalTodos: TodoInfo[] = [];

    const removedTaskSubjects = new Set(
      tasks.filter((t) => t.status === "deleted").map((t) => t.subject),
    );

    for (const existing of currentTodos) {
      const isInNewTodos = newTodos.some((newTodo) => todosMatch(existing, newTodo));
      const isRemovedById = existing.id ? tasksToRemove.has(existing.id) : false;
      const isRemovedByContent = !existing.id && removedTaskSubjects.has(existing.content);
      const isReplacedByTask = !existing.id && allTaskSubjects.has(existing.content);
      if (!isInNewTodos && !isRemovedById && !isRemovedByContent && !isReplacedByTask) {
        finalTodos.push(existing);
      }
    }

    finalTodos.push(...newTodos);

    const resolvedWriter = writer ?? (await resolveTodoWriter());
    if (sessionID) {
      await writeTodosWithFallback(sessionID, finalTodos, resolvedWriter);
    }

    log("[todo-sync] Synced todos", {
      count: finalTodos.length,
      sessionID,
    });
  } catch (err) {
    log("[todo-sync] Error in syncAllTasksToTodos", {
      error: String(err),
      sessionID,
    });
  }
}
