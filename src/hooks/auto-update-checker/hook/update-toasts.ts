import type { PluginContextSlice } from "../../../plugin/types"
import { log } from "../../../shared/logger"

export async function showUpdateAvailableToast(
  ctx: PluginContextSlice<"client">,
  latestVersion: string,
  getToastMessage: (isUpdate: boolean, latestVersion?: string) => string
): Promise<void> {
  await ctx.client.tui
    .showToast({
      body: {
        title: `Matrixx ${latestVersion}`,
        message: getToastMessage(true, latestVersion),
        variant: "info" as const,
        duration: 8000,
      },
    })
    .catch((err) => { log("[auto-update] Update available toast failed:", err) })
  log(`[auto-update-checker] Update available toast shown: v${latestVersion}`)
}

export async function showAutoUpdatedToast(ctx: PluginContextSlice<"client">, oldVersion: string, newVersion: string): Promise<void> {
  await ctx.client.tui
    .showToast({
      body: {
        title: "Matrixx Updated!",
        message: `v${oldVersion} → v${newVersion}\nRestart OpenCode to apply.`,
        variant: "success" as const,
        duration: 8000,
      },
    })
    .catch((err) => { log("[auto-update] Auto-updated toast failed:", err) })
  log(`[auto-update-checker] Auto-updated toast shown: v${oldVersion} → v${newVersion}`)
}
