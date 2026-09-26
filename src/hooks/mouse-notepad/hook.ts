import { V1_HOOK_KEYS } from "../../config/schema/hooks-v1-keys"
import type { PluginContextSlice } from "../../plugin/types"
import { log } from "../../shared/logger"
import { isCallerOrchestrator } from "../../shared/session-utils"
import { SYSTEM_DIRECTIVE_PREFIX } from "../../shared/system-directive"
import { HOOK_NAME, NOTEPAD_DIRECTIVE } from "./constants"

export function createMouseNotepadHook(ctx: PluginContextSlice<"client">) {
  return {
    [V1_HOOK_KEYS.toolExecuteBefore]: async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown>; message?: string }
    ): Promise<void> => {
      // 1. Check if tool is task
      if (input.tool !== "task") {
        return
      }

      // 2. Check if caller is Architect (orchestrator)
      if (!(await isCallerOrchestrator(input.sessionID, ctx.client))) {
        return
      }

      // 3. Get prompt from output.args
      const prompt = output.args.prompt as string | undefined
      if (!prompt) {
        return
      }

      // 4. Check for double injection
      if (prompt.includes(SYSTEM_DIRECTIVE_PREFIX)) {
        return
      }

      // 5. Prepend directive
      output.args.prompt = NOTEPAD_DIRECTIVE + prompt

      // 6. Log injection
      log(`[${HOOK_NAME}] Injected notepad directive to task`, {
        sessionID: input.sessionID,
      })
    },
  }
}
