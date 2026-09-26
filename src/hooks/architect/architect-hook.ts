import { V1_HOOK_KEYS } from "../../config/schema/hooks-v1-keys"
import type { PluginContext } from "../../plugin/types"
import { createArchitectEventHandler } from "./event-handler"
import { createToolExecuteAfterHandler } from "./tool-execute-after"
import { createToolExecuteBeforeHandler } from "./tool-execute-before"
import type { ArchitectHookOptions, SessionState } from "./types"

export function createArchitectHook(ctx: PluginContext, options?: ArchitectHookOptions) {
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
    [V1_HOOK_KEYS.toolExecuteBefore]: createToolExecuteBeforeHandler({ ctx, pendingFilePaths }),
    [V1_HOOK_KEYS.toolExecuteAfter]: createToolExecuteAfterHandler({ ctx, pendingFilePaths }),
  }
}
