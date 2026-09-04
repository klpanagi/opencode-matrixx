import { log } from "./logger"

export interface TodoInfo {
  id?: string
  content: string
  status: "pending" | "in_progress" | "completed" | "cancelled"
  priority?: "low" | "medium" | "high"
}

export type TodoWriter = (input: { sessionID: string; todos: TodoInfo[] }) => Promise<void>

function wrapUpdate(raw: unknown): TodoWriter {
  return async (input) => {
    const fn = raw as (i: unknown) => unknown
    const result = fn(input)
    if (result && typeof result === "object" && "pipe" in (result as Record<string, unknown>)) {
      try {
        // @ts-ignore — effect provided by opencode runtime
        const { Effect } = await import("effect")
        await (Effect as unknown as { runPromise: (e: unknown) => Promise<void> }).runPromise(result)
        return
      } catch {
      }
    }
    await result
  }
}

let cachedWriter: TodoWriter | null | undefined

export async function resolveTodoWriter(): Promise<TodoWriter | null> {
  if (typeof cachedWriter === "function") return cachedWriter
  try {
    // @ts-ignore — resolved at runtime by opencode plugin host
    const mod = await import("opencode/session/todo") as { Todo?: { update?: unknown } }
    const update = mod.Todo?.update
    if (typeof update === "function") {
      cachedWriter = wrapUpdate(update)
      log("[opencode-todo-writer] Resolved Todo.update", { loader: "opencode/session/todo" })
      return cachedWriter
    }
    log("[opencode-todo-writer] Failed to resolve Todo.update", {
      loader: "opencode/session/todo",
      error: "Todo.update is not a function",
    })
  } catch (err) {
    log("[opencode-todo-writer] Failed to resolve Todo.update", { loader: "opencode/session/todo", error: String(err) })
  }
  try {
    // @ts-ignore — resolved at runtime by opencode plugin host
    const mod = await import("@opencode-ai/core/session/todo") as { Todo?: { update?: unknown }; SessionTodo?: { update?: unknown } }
    const update = (mod as { Todo?: { update?: unknown } }).Todo?.update ?? (mod as { SessionTodo?: { update?: unknown } }).SessionTodo?.update
    if (typeof update === "function") {
      cachedWriter = wrapUpdate(update)
      log("[opencode-todo-writer] Resolved Todo.update", { loader: "@opencode-ai/core/session/todo" })
      return cachedWriter
    }
    log("[opencode-todo-writer] Failed to resolve Todo.update", {
      loader: "@opencode-ai/core/session/todo",
      error: "Todo.update is not a function",
    })
  } catch (err) {
    log("[opencode-todo-writer] Failed to resolve Todo.update", { loader: "@opencode-ai/core/session/todo", error: String(err) })
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
