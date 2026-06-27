import type { PluginInput } from "@opencode-ai/plugin"
import { createArchitectEventHandler } from "./event-handler"
import { createToolExecuteAfterHandler } from "./tool-execute-after"
import { createToolExecuteBeforeHandler } from "./tool-execute-before"
import type { ArchitectHookOptions, SessionState } from "./types"

export function createArchitectHook(ctx: PluginInput, options?: ArchitectHookOptions) {
  const sessions = new Map<string, SessionState>()
  const pendingFilePaths = new Map<string, string>()

  function getState(sessionID: string): SessionState {
    let state = sessions.get(sessionID)
    if (!state) {
      state = { promptFailureCount: 0 }
      sessions.set(sessionID, state)
    }
    return state
  }

  return {
    handler: createArchitectEventHandler({ ctx, options, sessions, getState }),
    "tool.execute.before": createToolExecuteBeforeHandler({ ctx, pendingFilePaths }),
    "tool.execute.after": createToolExecuteAfterHandler({ ctx, pendingFilePaths }),
  }
}
