import type { PluginInput } from "@opencode-ai/plugin"
import { normalizeSDKResponse } from "../shared"
import { warn } from "../shared/logger"

interface Todo {
  content: string
  status: string
  priority: string
  id: string
}

const DEPRECATION_MESSAGE =
  "[session-todo-status] The OpenCode todo read is deprecated but still active. " +
  "OpenCode's todo state is per-session and persists across the upgrade, so the read " +
  "is retained for in-flight sessions; it will be removed in v3.0."

let hasLoggedLegacyTodoReadDeprecation = false

/** Test-only: allow the one-time deprecation notice to fire again. */
export function resetSessionTodoReadDeprecationWarning(): void {
  hasLoggedLegacyTodoReadDeprecation = false
}

function warnAboutLegacyTodoReadOnce(): void {
  if (hasLoggedLegacyTodoReadDeprecation) return
  hasLoggedLegacyTodoReadDeprecation = true
  warn(DEPRECATION_MESSAGE)
}

/**
 * Why the real `session.todo()` read is retained after the legacy todo system was
 * removed: OpenCode's todo state is per-session and PERSISTS across the upgrade, so
 * a session opened before the removal can still hold a non-empty list. Returning a
 * hard-coded `false` here would report "nothing incomplete" to a user who does have
 * pending items, flipping `session-notification` idle-suppression and the
 * background-agent gate in the wrong direction on day one. The read is therefore
 * kept for one release and tracked as a removal issue scheduled for v3.0; a
 * one-time deprecation notice is logged through the shared logger.
 */
export async function hasIncompleteTodos(ctx: PluginInput, sessionID: string): Promise<boolean> {
  try {
    warnAboutLegacyTodoReadOnce()
    const response = await ctx.client.session.todo({ path: { id: sessionID } })
    const todos = normalizeSDKResponse(response, [] as Todo[], { preferResponseOnMissingData: true })
    if (!todos || todos.length === 0) return false
    return todos.some((todo) => todo.status !== "completed" && todo.status !== "cancelled")
  } catch {
    return false
  }
}
