import type { PluginInput } from "@opencode-ai/plugin"
import { log } from "../../../shared/logger"

const MORPHEUS_SPINNER = ["·", "•", "●", "○", "◌", "◦", " "]

export async function showSpinnerToast(ctx: PluginInput, version: string, message: string): Promise<void> {
  const totalDuration = 5000
  const frameInterval = 100
  const totalFrames = Math.floor(totalDuration / frameInterval)

  for (let i = 0; i < totalFrames; i++) {
    const spinner = MORPHEUS_SPINNER[i % MORPHEUS_SPINNER.length]
    await ctx.client.tui
      .showToast({
        body: {
          title: `${spinner} Matrixx ${version}`,
          message,
          variant: "info" as const,
          duration: frameInterval + 50,
        },
      })
      .catch((err) => { log("[auto-update] Spinner toast failed:", err) })

    await new Promise((resolve) => setTimeout(resolve, frameInterval))
  }
}
