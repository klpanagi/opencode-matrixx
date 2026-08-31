import type { PluginInput } from "@opencode-ai/plugin"
import { getMcpStartupFailures } from "../../mcp/mcp-startup-state"
import { log } from "../../shared/logger"

export function createMcpStartupNotificationHook(ctx: PluginInput) {
  let hasShown = false

  return {
    event: ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type !== "session.created") return
      if (process.env.OPENCODE_CLI_RUN_MODE === "true") return
      if (hasShown) return

      const props = event.properties as { info?: { parentID?: string } } | undefined
      if (props?.info?.parentID) return

      const failures = getMcpStartupFailures()
      if (failures.length === 0) return

      hasShown = true
      setTimeout(() => {
        const names = failures.map((f) => f.name).join(", ")
        const details = failures.map((f) => `• ${f.name}: ${f.error}`).join("\n")
        ctx.client.tui
          .showToast({
            body: {
              title: `${failures.length} MCP unavailable: ${names}`,
              message: details,
              variant: "warning",
              duration: 6000,
            },
          })
          .catch((err) => { log("[mcp-startup-notification] Toast failed:", err) })
      }, 0)
    },
  }
}
