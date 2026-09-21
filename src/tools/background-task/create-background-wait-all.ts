import { type ToolDefinition, tool } from "@opencode-ai/plugin"
import type { BackgroundManager } from "../../features/background-agent"
import { storeToolMetadata } from "../../features/tool-metadata-store"
import { BACKGROUND_WAIT_ALL_DESCRIPTION } from "./constants"
import type { ToolContextWithMetadata } from "./types"

function resolveToolCallID(ctx: ToolContextWithMetadata & { callID?: string; callId?: string; call_id?: string }): string | undefined {
  if (typeof ctx.callID === "string" && ctx.callID.trim() !== "") return ctx.callID
  if (typeof ctx.callId === "string" && ctx.callId.trim() !== "") return ctx.callId
  if (typeof ctx.call_id === "string" && ctx.call_id.trim() !== "") return ctx.call_id
  return undefined
}

export function createBackgroundWaitAll(manager: BackgroundManager): ToolDefinition {
  return tool({
    description: BACKGROUND_WAIT_ALL_DESCRIPTION,
    args: {
      timeout: tool.schema
        .number()
        .optional()
        .describe("Max wait time in ms (default: 30000, max: 120000)"),
    },
    async execute(args: { timeout?: number }, toolContext) {
      try {
        const ctx = toolContext as ToolContextWithMetadata
        const timeoutMs = Math.min(args.timeout ?? 30000, 120000)

        const callID = resolveToolCallID(ctx as ToolContextWithMetadata & { callID?: string; callId?: string; call_id?: string })
        if (callID) {
          storeToolMetadata(ctx.sessionID, callID, {
            title: "Wait for all background tasks",
            metadata: { timeoutMs } as Record<string, unknown>,
          })
        }

        const result = await manager.waitForAllDescendants(ctx.sessionID, timeoutMs)

        if (result.completed.length === 0 && result.timedOut.length === 0) {
          return "No background tasks were running or pending. Nothing to wait for."
        }

        const lines: string[] = []
        if (result.completed.length > 0) {
          lines.push(`## Completed (${result.completed.length})`)
          lines.push("| Task ID | Description | Agent | Status |")
          lines.push("|---------|-------------|-------|--------|")
          for (const t of result.completed) {
            lines.push(`| \`${t.id}\` | ${t.description} | ${t.agent} | ${t.status} |`)
          }
        }

        if (result.timedOut.length > 0) {
          lines.push(`\n## Timed Out (${result.timedOut.length})`)
          lines.push("These tasks did not finish within the timeout and are still running.")
          lines.push("| Task ID | Description | Agent | Status |")
          lines.push("|---------|-------------|-------|--------|")
          for (const t of result.timedOut) {
            lines.push(`| \`${t.id}\` | ${t.description} | ${t.agent} | ${t.status} |`)
          }
          lines.push(
            "\n> Use `background_output(task_id=\"...\")` to check individual results, or `background_cancel(all=true)` to clean up.",
          )
        }

        return lines.join("\n")
      } catch (error) {
        return `[ERROR] Error waiting for background tasks: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}
