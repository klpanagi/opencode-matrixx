import type { PluginInput } from "@opencode-ai/plugin";
import { getMainSessionID } from "../../features/session-state/state";
import type { Task } from "../../features/task-storage/types";
import { log } from "../../shared/logger";
import {
  type TodoWriter as SharedTodoWriter,
  _resetForTesting as sharedReset,
  resolveTodoWriter as sharedResolveTodoWriter,
  _setWriterForTesting as sharedSetWriter,
} from "../../shared/opencode-todo-writer";

export interface TodoInfo {
  id?: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority?: "low" | "medium" | "high";
}

type TodoWriter = SharedTodoWriter;
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

async function resolveTodoWriter(ctx?: PluginInput): Promise<TodoWriter | null> {
  return sharedResolveTodoWriter(ctx as unknown as PluginInput) as Promise<TodoWriter | null>
}

export function _resetForTesting(): void {
  sharedReset()
}

export function _setWriterForTesting(writer: TodoWriter | null | undefined): void {
  sharedSetWriter(writer as SharedTodoWriter | null | undefined)
}

async function writeTodosViaApi(
  ctx: PluginInput | undefined,
  sessionID: string,
  todos: TodoInfo[],
  writer: TodoWriter | null,
): Promise<void> {
  if (!sessionID?.trim()) {
    log("[todo-sync] skip writeTodosViaApi: empty sessionID", { count: todos.length })
    return
  }
  const resolvedWriter = writer ?? (await resolveTodoWriter(ctx))
  if (!resolvedWriter) {
    log("[todo-sync] writeTodosViaApi failed: Todo.update unavailable", { sessionID })
    throw new Error("Todo.update unavailable")
  }
  try {
    await resolvedWriter({ sessionID, todos })
    log("[todo-sync] writeTodosViaApi ok", { sessionID, count: todos.length })
  } catch (err) {
    log("[todo-sync] writeTodosViaApi failed", { sessionID, error: String(err) })
    throw err
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
  if (!sessionID?.trim()) {
    log("[todo-sync] skip syncTaskTodoUpdate: empty sessionID", { taskId: task.id })
    return
  }
  const resolvedWriter = writer ?? (await resolveTodoWriter(ctx));
  await syncSingleSession(ctx, task, sessionID, resolvedWriter);
  const mainSessionID = safeGetMainSessionID();
  if (mainSessionID?.trim() && mainSessionID !== sessionID) {
    await syncSingleSession(ctx, task, mainSessionID, resolvedWriter);
  }
}

async function syncSingleSession(
  ctx: PluginInput,
  task: Task,
  sessionID: string,
  writer: TodoWriter | null,
): Promise<void> {
  if (!sessionID?.trim()) {
    log("[todo-sync] skip syncSingleSession: empty sessionID", { taskId: task.id })
    return
  }
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
    await writeTodosViaApi(ctx, sessionID, nextTodos, writer);
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
  if (!sessionID?.trim()) {
    log("[todo-sync] skip syncAllTasksToTodos: empty sessionID", { count: tasks.length })
    return
  }
  try {
    let currentTodos: TodoInfo[] = [];
    try {
      const response = await ctx.client.session.todo({
        path: { id: sessionID },
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

    const visibleTodos = finalTodos.filter((t) => t.status !== "completed" && t.status !== "cancelled");
    const resolvedWriter = writer ?? (await resolveTodoWriter(ctx));
    await writeTodosViaApi(ctx, sessionID, visibleTodos, resolvedWriter);

    log("[todo-sync] Synced todos", {
      count: visibleTodos.length,
      sessionID,
    });
  } catch (err) {
    log("[todo-sync] Error in syncAllTasksToTodos", {
      error: String(err),
      sessionID,
    });
  }
}
