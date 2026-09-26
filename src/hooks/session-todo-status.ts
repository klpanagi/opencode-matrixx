import type { PluginContextSlice } from "../plugin/types"
import { normalizeSDKResponse } from "../shared"

interface Todo {
  content: string
  status: string
  priority: string
  id: string
}

export async function hasIncompleteTodos(ctx: PluginContextSlice<"client">, sessionID: string): Promise<boolean> {
  try {
    const response = await ctx.client.session.todo({ path: { id: sessionID } })
    const todos = normalizeSDKResponse(response, [] as Todo[], { preferResponseOnMissingData: true })
    if (!todos || todos.length === 0) return false
    return todos.some((todo) => todo.status !== "completed" && todo.status !== "cancelled")
  } catch {
    return false
  }
}
