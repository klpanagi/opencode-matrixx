import type { Hooks } from "@opencode-ai/plugin"
import { V1_HOOK_KEYS } from "../../config/schema/hooks-v1-keys"
import type { PluginContextSlice } from "../../plugin/types"
import { log } from "../../shared"
import { BASH_BLOCK_MESSAGE, BINARY_EXTENSIONS, BLOCKED_PATTERNS, HOOK_NAME, READ_BLOCK_MESSAGE } from "./constants"

function getFilePath(args: Record<string, unknown>): string | undefined {
  const raw = args?.filePath ?? args?.path ?? args?.file
  return typeof raw === "string" ? raw : undefined
}

function isBinaryDocument(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replace(/\\/g, "/").split("?")[0].split("#")[0]
  return (BINARY_EXTENSIONS as readonly string[]).some((ext) => normalized.endsWith(ext))
}

export function createDocumentReaderGuardHook(ctx: PluginContextSlice<"directory">): Hooks {
  return {
    [V1_HOOK_KEYS.toolExecuteBefore]: async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown>; message?: string },
    ): Promise<void> => {
      const tool = input.tool?.toLowerCase()
      if (tool !== "read" && tool !== "bash") return

      if (tool === "read") {
        const filePath = getFilePath(output.args as unknown as Record<string, unknown>)
        if (!filePath || !isBinaryDocument(filePath)) return
        log(`[${HOOK_NAME}] BLOCKED generic Read on binary document — use document_reader MCP`, {
          sessionID: input.sessionID,
          tool: input.tool,
          filePath,
        })
        throw new Error(READ_BLOCK_MESSAGE)
      }

      const args = output.args as unknown as Record<string, unknown>
      const cmd = args?.command as string | undefined
      if (!cmd) return
      if (!BLOCKED_PATTERNS.some((rx) => rx.test(cmd))) return

      void ctx.directory
      log(`[${HOOK_NAME}] BLOCKED bash document read`, {
        sessionID: input.sessionID,
        command: cmd.slice(0, 120),
      })
      throw new Error(BASH_BLOCK_MESSAGE)
    },
  }
}
