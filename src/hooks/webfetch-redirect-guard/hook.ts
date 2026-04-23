import type { PluginInput } from "@opencode-ai/plugin"
import { log } from "../../shared"
import {
  MAX_WEBFETCH_REDIRECTS,
  WEBFETCH_REDIRECT_ERROR_PATTERNS,
  WEBFETCH_REDIRECT_GUARD_STALE_TIMEOUT_MS,
} from "./constants"
import { resolveWebFetchRedirects, type WebFetchFormat } from "./redirect-resolution"

type ToolExecuteInput = { tool: string; sessionID: string; callID: string }
type ToolExecuteBeforeOutput = { args: Record<string, unknown> }
type ToolExecuteAfterOutput = { title: string; output: string; metadata: Record<string, unknown> }

type PendingRedirectFailure = { originalUrl: string; storedAt: number }

function makeKey(sessionID: string, callID: string): string {
  return `${sessionID}:${callID}`
}

function isWebFetchTool(toolName: string): boolean {
  return toolName.toLowerCase() === "webfetch"
}

function getWebFetchUrl(args: Record<string, unknown>): string | undefined {
  return typeof args.url === "string" && args.url.length > 0 ? args.url : undefined
}

function getWebFetchFormat(args: Record<string, unknown>): WebFetchFormat {
  return args.format === "text" || args.format === "html" ? args.format : "markdown"
}

function getTimeoutSeconds(args: Record<string, unknown>): number | undefined {
  return typeof args.timeout === "number" && Number.isFinite(args.timeout) ? args.timeout : undefined
}

function cleanupStaleEntries(pendingFailures: Map<string, PendingRedirectFailure>): void {
  const now = Date.now()
  for (const [key, value] of pendingFailures) {
    if (now - value.storedAt > WEBFETCH_REDIRECT_GUARD_STALE_TIMEOUT_MS) {
      pendingFailures.delete(key)
    }
  }
}

function isRedirectLoopError(output: string): boolean {
  return WEBFETCH_REDIRECT_ERROR_PATTERNS.some((pattern) => pattern.test(output))
}

function isToolErrorOutput(output: string): boolean {
  return output.trimStart().toLowerCase().startsWith("error:")
}

function buildRedirectLimitMessage(url?: string): string {
  const suffix = url ? ` for ${url}` : ""
  return `Error: WebFetch failed: exceeded maximum redirects (${MAX_WEBFETCH_REDIRECTS})${suffix}`
}

export function createWebFetchRedirectGuardHook(_ctx: PluginInput) {
  const pendingFailures = new Map<string, PendingRedirectFailure>()

  return {
    "tool.execute.before": async (input: ToolExecuteInput, output: ToolExecuteBeforeOutput) => {
      if (!isWebFetchTool(input.tool)) return

      const url = getWebFetchUrl(output.args)
      if (!url) return

      cleanupStaleEntries(pendingFailures)

      try {
        const result = await resolveWebFetchRedirects({
          url,
          format: getWebFetchFormat(output.args),
          timeoutSeconds: getTimeoutSeconds(output.args),
        })

        if (result.type === "resolved" && result.url !== url) {
          output.args.url = result.url
          log("[webfetch-redirect-guard] Resolved redirect", { from: url, to: result.url })
        }

        if (result.type === "exceeded") {
          pendingFailures.set(makeKey(input.sessionID, input.callID), {
            originalUrl: result.url,
            storedAt: Date.now(),
          })
        }
      } catch {
        // network errors are non-fatal; let webfetch attempt proceed
      }
    },

    "tool.execute.after": async (input: ToolExecuteInput, output: ToolExecuteAfterOutput) => {
      if (!isWebFetchTool(input.tool)) return
      if (!isToolErrorOutput(output.output)) return
      if (!isRedirectLoopError(output.output)) return

      const key = makeKey(input.sessionID, input.callID)
      const pending = pendingFailures.get(key)
      pendingFailures.delete(key)

      output.output = buildRedirectLimitMessage(pending?.originalUrl)
    },
  }
}
