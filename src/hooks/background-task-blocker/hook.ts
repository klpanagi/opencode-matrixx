import { V1_HOOK_KEYS } from "../../config/schema/hooks-v1-keys"
export function createBackgroundTaskBlockerHook() {
  return {
    [V1_HOOK_KEYS.toolExecuteBefore]: async (
      input: { tool: string; sessionID: string; callID: string },
      _output: { args: Record<string, unknown>; message?: string }
    ): Promise<void> => {
      if (input.tool === "background_task") {
        throw new Error(
          'Tool "background_task" is disabled. Use the "task" tool with category/subagent_type and run_in_background=true for agent delegation.'
        )
      }
    },
  }
}
