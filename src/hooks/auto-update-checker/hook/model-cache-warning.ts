import type { PluginContextSlice } from "../../../plugin/types"
import { log } from "../../../shared/logger"
import { isModelCacheAvailable } from "../../../shared/model-availability"

export async function showModelCacheWarningIfNeeded(ctx: PluginContextSlice<"client">): Promise<void> {
  if (isModelCacheAvailable()) return

  await ctx.client.tui
    .showToast({
      body: {
        title: "Model Cache Not Found",
        message:
          "Run 'opencode models --refresh' or restart OpenCode to populate the models cache for optimal agent model selection.",
        variant: "warning" as const,
        duration: 10000,
      },
    })
    .catch((err) => { log("[auto-update] Model cache warning toast failed:", err) })

  log("[auto-update-checker] Model cache warning shown")
}
