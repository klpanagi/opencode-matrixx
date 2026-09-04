import { log } from "./logger"

export interface TodoInfo {
  id?: string
  content: string
  status: "pending" | "in_progress" | "completed" | "cancelled"
  priority?: "low" | "medium" | "high"
}

export type TodoWriter = (input: { sessionID: string; todos: TodoInfo[] }) => Promise<void>

const loaders = ["opencode/session/todo", "@opencode-ai/core/session/todo"] as const

let cachedWriter: TodoWriter | null | undefined

export async function resolveTodoWriter(): Promise<TodoWriter | null> {
  if (typeof cachedWriter === "function") return cachedWriter
  for (const loader of loaders) {
    try {
      const mod = (await import(loader)) as { Todo?: { update?: unknown } }
      const update = mod.Todo?.update
      if (typeof update === "function") {
        cachedWriter = update as TodoWriter
        log("[opencode-todo-writer] Resolved Todo.update", { loader })
        return cachedWriter
      }
      log("[opencode-todo-writer] Failed to resolve Todo.update", {
        loader,
        error: "Todo.update is not a function",
      })
    } catch (err) {
      log("[opencode-todo-writer] Failed to resolve Todo.update", { loader, error: String(err) })
    }
  }
  cachedWriter = null
  return null
}

export function _resetForTesting(): void {
  cachedWriter = undefined
}

export function _setWriterForTesting(writer: TodoWriter | null | undefined): void {
  cachedWriter = writer
}
