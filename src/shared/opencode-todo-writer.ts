import type { PluginInput } from "@opencode-ai/plugin"
import { log } from "./logger"

export interface TodoInfo {
  id?: string
  content: string
  status: "pending" | "in_progress" | "completed" | "cancelled"
  priority?: "low" | "medium" | "high"
}

export type TodoWriter = (input: { sessionID: string; todos: TodoInfo[] }) => Promise<void>

export const SessionTodoEvent = {
  Updated: "session.todo.updated",
} as const

function wrapUpdate(raw: unknown): TodoWriter {
  return async (input) => {
    const fn = raw as (i: unknown) => unknown
    const result = fn(input)
    if (result && typeof result === "object" && "pipe" in (result as Record<string, unknown>)) {
      try {
        // @ts-ignore — effect provided by host plugin layer
        const { Effect } = await import("effect")
        await (Effect as unknown as { runPromise: (e: unknown) => Promise<void> }).runPromise(result)
        return
      } catch {}
    }
    await result
  }
}

let cachedWriter: TodoWriter | null | undefined
let cachedCtx: PluginInput | null | undefined

function extractHostUpdate(ctx: PluginInput): unknown | null {
  const c = ctx as unknown as Record<string, unknown>
  if (typeof c["__hostTodoUpdate"] === "function") return c["__hostTodoUpdate"]
  if (typeof c["hostTodoUpdate"] === "function") return c["hostTodoUpdate"]
  if (typeof c["todoUpdate"] === "function") return c["todoUpdate"]
  const todo = c["Todo"] as Record<string, unknown> | undefined
  if (todo && typeof todo["update"] === "function") return todo["update"]
  const sessionTodo = c["SessionTodo"] as Record<string, unknown> | undefined
  if (sessionTodo && typeof sessionTodo["update"] === "function") return sessionTodo["update"]
  const sessionTodoLower = c["sessionTodo"] as Record<string, unknown> | undefined
  if (sessionTodoLower && typeof sessionTodoLower["update"] === "function") return sessionTodoLower["update"]
  const services = c["services"] as Record<string, unknown> | undefined
  if (services) {
    for (const key of ["@opencode/SessionTodo", "SessionTodo", "Todo", "sessionTodo", "session.todo"]) {
      const svc = services[key] as Record<string, unknown> | undefined
      if (svc && typeof svc["update"] === "function") return svc["update"]
      if (typeof svc === "function") return svc
    }
    if (typeof services["update"] === "function") return services["update"]
  }
  const client = c["client"] as Record<string, unknown> | undefined
  if (client) {
    const maybe = (client as Record<string, unknown>)["__todoUpdate"]
    if (typeof maybe === "function") return maybe
  }
  const sym = (c as unknown as Record<symbol, unknown>)[Symbol.for("@opencode/SessionTodo")]
  if (sym && typeof (sym as Record<string, unknown>)["update"] === "function") {
    return (sym as Record<string, unknown>)["update"]
  }
  return null
}

export async function resolveTodoWriter(ctx: PluginInput): Promise<TodoWriter | null>
export async function resolveTodoWriter(ctx?: PluginInput): Promise<TodoWriter | null>
export async function resolveTodoWriter(ctx?: PluginInput): Promise<TodoWriter | null> {
  if (cachedWriter !== undefined && cachedCtx === undefined) {
    return cachedWriter
  }
  if (typeof cachedWriter === "function" && cachedCtx === ctx) return cachedWriter
  if (cachedWriter === null && cachedCtx === ctx) return null
  if (cachedWriter !== undefined && !ctx) {
    if (typeof cachedWriter === "function") return cachedWriter
    if (cachedWriter === null) return null
  }
  if (!ctx) {
    log("[opencode-todo-writer] Todo.update unavailable — no PluginInput context", {
      loader: "host-blessed",
    })
    cachedWriter = null
    cachedCtx = ctx as unknown as PluginInput | null | undefined
    return null
  }
  try {
    const update = extractHostUpdate(ctx)
    if (typeof update === "function") {
      cachedWriter = wrapUpdate(update)
      cachedCtx = ctx
      log("[opencode-todo-writer] Resolved Todo.update", { loader: "host-blessed" })
      return cachedWriter
    }
    log("[opencode-todo-writer] Todo.update unavailable — host-blessed service not found", {
      loader: "host-blessed",
    })
    cachedWriter = null
    cachedCtx = ctx
    return null
  } catch (err) {
    log("[opencode-todo-writer] Failed to resolve Todo.update", {
      loader: "host-blessed",
      error: String(err),
    })
    cachedWriter = null
    cachedCtx = ctx
    return null
  }
}

export function _resetForTesting(): void {
  cachedWriter = undefined
  cachedCtx = undefined as unknown as PluginInput | null | undefined
}

export function _setWriterForTesting(writer: TodoWriter | null | undefined): void {
  cachedWriter = writer
}
