import type { Task } from "../../features/task-storage/types"

export function getIncompleteCount(todos: { status: string }[]): number {
  return todos.filter(
    (todo) =>
      todo.status !== "completed" &&
      todo.status !== "cancelled" &&
      todo.status !== "blocked" &&
      todo.status !== "deleted",
  ).length
}

export function getIncompleteTasks(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  return tasks.filter((task) => {
    if (task.status !== "pending" && task.status !== "in_progress") return false
    if (task.blockedBy.length === 0) return true
    return task.blockedBy.every((bid) => byId.get(bid)?.status === "completed")
  })
}

export function getIncompleteTaskCount(tasks: Task[]): number {
  return getIncompleteTasks(tasks).length
}

export interface SessionFilterOptions {
  sessionID: string
  /** LIVE subagent session ids (dead/unregistered subagents are excluded). */
  subagentIDs: string[]
  sessionScoped?: boolean // default: true
}

/**
 * Drop subtasks whose parent task is already resolved (completed/deleted).
 * A task is dropped only when its `parentID` resolves to a task in the full
 * input array whose status is "completed" or "deleted". Tasks without a
 * parentID, or whose parent is missing from the input, are kept.
 */
export function dropSubtasksWithResolvedParent(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  return tasks.filter((task) => {
    if (!task.parentID) return true
    const parent = byId.get(task.parentID)
    if (!parent) return true
    return parent.status !== "completed" && parent.status !== "deleted"
  })
}

/**
 * Filter tasks by session scope.
 * - When sessionScoped=false: all tasks pass through (opt-out / legacy behavior)
 * - Pre-migration tasks (no threadID) are always included for backward compatibility
 * - Current session's tasks (threadID === sessionID) are included
 * - Subagent session tasks (threadID in subagentIDs) are included
 * - All other tasks are excluded
 */
export function filterTasksBySession(
  tasks: Task[],
  options: SessionFilterOptions
): Task[] {
  if (options.sessionScoped === false) return tasks
  return tasks.filter((task) => {
    if (!task.threadID) return true
    if (task.threadID === options.sessionID) return true
    if (options.subagentIDs.includes(task.threadID)) return true
    return false
  })
}

