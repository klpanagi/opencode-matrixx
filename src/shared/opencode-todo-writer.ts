import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
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
  log("[opencode-todo-writer] Todo.update unavailable — using direct DB fallback with Event trigger", {})
  const fallback: TodoWriter = async ({ sessionID, todos }) => {
    const getOpencodeDbPath = (): string | null => {
      const candidates: string[] = []
      if (process.env.XDG_DATA_HOME) candidates.push(join(process.env.XDG_DATA_HOME, "opencode", "opencode.db"))
      candidates.push(join(homedir(), ".local", "share", "opencode", "opencode.db"))
      candidates.push(join(homedir(), ".config", "opencode", "opencode.db"))
      for (const p of candidates) if (existsSync(p)) return p
      return null
    }
    const dbPath = getOpencodeDbPath()
    if (!dbPath || !existsSync(dbPath)) throw new Error("opencode.db not found")
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // @ts-ignore — bun:sqlite is runtime only
        const mod = await import("bun:sqlite")
        const Database = (mod as unknown as { Database: new (path: string) => { exec: (s: string) => unknown; prepare: (s: string) => { run: (...a: unknown[]) => unknown }; close: () => void } }).Database
        const db = new Database(dbPath)
        const now = Date.now()
        try {
          db.exec("BEGIN IMMEDIATE")
          db.prepare("DELETE FROM todo WHERE session_id = ?").run(sessionID)
          const stmt = db.prepare("INSERT INTO todo (session_id, content, status, priority, position, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?)")
          todos.forEach((t, idx) => stmt.run(sessionID, t.content, t.status, t.priority ?? "medium", idx, now, now))
          db.exec("COMMIT")
        } catch (inner) { try { db.exec("ROLLBACK") } catch {} throw inner } finally { db.close() }
        log("[opencode-todo-writer] fallback directDbWrite ok", { sessionID, count: todos.length })
        break
      } catch (err) {
        const msg = String(err)
        const busy = msg.includes("BUSY") || msg.includes("busy") || msg.includes("locked")
        if (busy && attempt < 2) { await new Promise<void>((r) => setTimeout(r, 25 * (attempt + 1))); continue }
        log("[opencode-todo-writer] fallback directDbWrite failed", { error: msg })
        throw err
      }
    }
    try {
      // @ts-ignore — optional
      const { createOpencodeClient } = await import("@opencode-ai/sdk")
      const client = createOpencodeClient({ baseUrl: "http://127.0.0.1:4096" })
      await (client as unknown as { session: { todo: (o: unknown) => Promise<unknown> } }).session.todo({ path: { id: sessionID } }).catch(()=>{})
    } catch {}
  }
  cachedWriter = fallback
  return fallback
}
export function _resetForTesting(): void {
  cachedWriter = undefined
}

export function _setWriterForTesting(writer: TodoWriter | null | undefined): void {
  cachedWriter = writer
}
