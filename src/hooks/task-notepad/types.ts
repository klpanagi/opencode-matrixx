import type { PluginContext } from "../../plugin/types"

type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled"
type TodoPriority = "low" | "medium" | "high"

export interface TodoSnapshot {
  id: string
  content: string
  status: TodoStatus
  priority?: TodoPriority
}

export interface PlanFile {
  name: string
  path: string
  mtimeMs: number
}

export type TaskNotepadContext = Pick<PluginContext, "client" | "directory">
