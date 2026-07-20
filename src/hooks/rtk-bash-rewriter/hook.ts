import type { PluginInput } from "@opencode-ai/plugin"
import type { MatrixxConfig } from "../../config"
import { log } from "../../shared"
import { DEFAULT_TIMEOUT_MS, RTK_BINARY_NAME, RTK_REWRITE_COMMAND } from "./constants"

export function createRtkBashRewriterHook(_ctx: PluginInput, config: MatrixxConfig) {
  const rtkConfig = config.rtk
  const _timeoutMs = rtkConfig?.timeout_ms ?? DEFAULT_TIMEOUT_MS
  const binaryPath = rtkConfig?.binary_path ?? RTK_BINARY_NAME

  // Check for rtk binary at creation time (not per-call)
  const hasRtk = Bun.which(binaryPath) !== null
  if (!hasRtk) {
    log(`[rtk-bash-rewriter] rtk binary not found at '${binaryPath}'. Hook will pass through all commands.`)
  }

  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown>; message?: string }
    ): Promise<void> => {
      // Only intercept bash tool (not interactive-bash)
      if (input.tool.toLowerCase() !== "bash") {
        return
      }

      // If rtk not available, pass through silently
      if (!hasRtk) {
        return
      }

      const command = output.args.command as string | undefined
      if (!command) {
        return
      }

      try {
        const proc = Bun.spawn([binaryPath, RTK_REWRITE_COMMAND, command], {
          stdout: "pipe",
          stderr: "pipe",
        })

        // Wait for exit with timeout
        const exited = await proc.exited
        if (exited !== 0) {
          // Exit codes 1/2/3 = passthrough (no blocking)
          return
        }

        const rewritten = await new Response(proc.stdout).text()
        const trimmed = rewritten.trim()

        // Only mutate if rewrite produced a different command
        if (trimmed && trimmed !== command) {
          output.args.command = trimmed
          log(`[rtk-bash-rewriter] Rewrote command: '${command}' → '${trimmed}'`)
        }
      } catch (error) {
        // Silent passthrough on any error
        log(`[rtk-bash-rewriter] Rewrite failed: ${error}`)
      }
    },
  }
}
