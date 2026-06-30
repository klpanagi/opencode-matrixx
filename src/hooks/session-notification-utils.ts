import { log } from "../shared/logger"

type Platform = "darwin" | "linux" | "win32" | "unsupported"

async function findCommand(commandName: string): Promise<string | null> {
  try {
    return Bun.which(commandName)
  } catch {
    return null
  }
}

function createCommandFinder(commandName: string): () => Promise<string | null> {
  let cachedPath: string | null = null
  let pending: Promise<string | null> | null = null

  return async () => {
    if (cachedPath !== null) return cachedPath
    if (pending) return pending

    pending = (async () => {
      const path = await findCommand(commandName)
      cachedPath = path
      return path
    })()

    return pending
  }
}

export const getNotifySendPath = createCommandFinder("notify-send")
export const getOsascriptPath = createCommandFinder("osascript")
export const getPowershellPath = createCommandFinder("powershell")
export const getAfplayPath = createCommandFinder("afplay")
export const getPaplayPath = createCommandFinder("paplay")
export const getAplayPath = createCommandFinder("aplay")

export function startBackgroundCheck(platform: Platform): void {
  if (platform === "darwin") {
    getOsascriptPath().catch((err) => { log("[notification] Background check failed for osascript:", err) })
    getAfplayPath().catch((err) => { log("[notification] Background check failed for afplay:", err) })
  } else if (platform === "linux") {
    getNotifySendPath().catch((err) => { log("[notification] Background check failed for notify-send:", err) })
    getPaplayPath().catch((err) => { log("[notification] Background check failed for paplay:", err) })
    getAplayPath().catch((err) => { log("[notification] Background check failed for aplay:", err) })
  } else if (platform === "win32") {
    getPowershellPath().catch((err) => { log("[notification] Background check failed for powershell:", err) })
  }
}
