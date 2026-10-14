import type { PluginInput } from "@opencode-ai/plugin"
import { log } from "../../shared/logger"
import { isCallerOrchestrator } from "../../shared/session-utils"
import { SYSTEM_DIRECTIVE_PREFIX } from "../../shared/system-directive"
import { classifyBashCommand } from "./bash-command-policy"
import { HOOK_NAME } from "./hook-name"
import { isMatrixPath } from "./matrix-path"
import { ORCHESTRATOR_DELEGATION_REQUIRED, SINGLE_TASK_DIRECTIVE } from "./system-reminder-templates"
import { isWriteOrEditToolName } from "./write-edit-tool-policy"

export function createToolExecuteBeforeHandler(input: {
  ctx: PluginInput
  pendingFilePaths: Map<string, string>
}): (
  toolInput: { tool: string; sessionID?: string; callID?: string },
  toolOutput: { args: Record<string, unknown>; message?: string }
) => Promise<void> {
  const { ctx, pendingFilePaths } = input

  return async (toolInput, toolOutput): Promise<void> => {
    if (!(await isCallerOrchestrator(toolInput.sessionID, ctx.client))) {
      return
    }

    // Check Write/Edit tools for orchestrator - inject strong warning
    // Warn-only policy: Architect guides orchestrators toward delegation but doesn't block, allowing flexibility for urgent fixes
    if (isWriteOrEditToolName(toolInput.tool)) {
      const filePath = (toolOutput.args.filePath ?? toolOutput.args.path ?? toolOutput.args.file) as string | undefined
      if (filePath && !isMatrixPath(filePath)) {
        // Store filePath for use in tool.execute.after
        if (toolInput.callID) {
          pendingFilePaths.set(toolInput.callID, filePath)
        }
        const warning = ORCHESTRATOR_DELEGATION_REQUIRED.replace("$FILE_PATH", filePath)
        toolOutput.message = (toolOutput.message || "") + warning
        log(`[${HOOK_NAME}] Injected delegation warning for direct file modification`, {
          sessionID: toolInput.sessionID,
          tool: toolInput.tool,
          filePath,
        })
      }
      return
    }

    // Bash policy: verdict comes ONLY from classifyBashCommand (bash-command-policy); block fail-closed on deny.
    if (toolInput.tool === "bash") {
      const command = toolOutput.args.command as string | undefined
      if (!command) {
        return
      }
      if (classifyBashCommand(command) === "deny") {
        log(`[${HOOK_NAME}] BLOCKED orchestrator bash mutation`, {
          sessionID: toolInput.sessionID,
          tool: toolInput.tool,
          command: command.slice(0, 120),
        })
        throw new Error(
          "Blocked: orchestrator must delegate file mutations to specialists. " +
            "Use task with category instead of raw bash for: " +
            command.slice(0, 120),
        )
      }
      return
    }

    // Check task - inject single-task directive
    if (toolInput.tool === "task") {
      const prompt = toolOutput.args.prompt as string | undefined
      if (prompt && !prompt.includes(SYSTEM_DIRECTIVE_PREFIX)) {
        toolOutput.args.prompt = `<system-reminder>${SINGLE_TASK_DIRECTIVE}</system-reminder>\n${prompt}`
        log(`[${HOOK_NAME}] Injected single-task directive to task`, {
          sessionID: toolInput.sessionID,
        })
      }
    }
  }
}
