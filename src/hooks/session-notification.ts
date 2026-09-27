import type { PluginInput } from "@opencode-ai/plugin"
import type { MatrixxConfig } from "../config/schema"
import {
  getMainSessionID,
  getSubagentSessionIDs,
  subagentSessions,
} from "../features/session-state"
import { hasIncompleteTasksForSession } from "../features/task-session-scope"
import { createIdleNotificationScheduler } from "./session-notification-scheduler"
import {
  detectPlatform,
  getDefaultSoundPath,
  playSessionNotificationSound,
  sendSessionNotification,
} from "./session-notification-sender"
import {
  startBackgroundCheck,
} from "./session-notification-utils"

interface SessionNotificationConfig {
  title?: string
  message?: string
  playSound?: boolean
  soundPath?: string
  /** Delay in ms before sending notification to confirm session is still idle (default: 1500) */
  idleConfirmationDelay?: number
  /** Skip notification if the session (or one of its subagents) still has pending work in the file-backed task store (default: true) */
  skipIfIncompleteTodos?: boolean
  /** Maximum number of sessions to track before cleanup (default: 100) */
  maxTrackedSessions?: number
}
export function createSessionNotification(
  ctx: PluginInput,
  config: SessionNotificationConfig = {},
  /**
   * The plugin config is a separate parameter, not part of `SessionNotificationConfig`:
   * only `tasks.*` is read here, and widening the hook-local config would blur a
   * presentation-only shape into a carrier for task-storage settings.
   */
  pluginConfig?: Partial<MatrixxConfig>
) {
  const currentPlatform = detectPlatform()
  const defaultSoundPath = getDefaultSoundPath(currentPlatform)

  startBackgroundCheck(currentPlatform)

  const mergedConfig = {
    title: "OpenCode",
    message: "Agent is ready for input",
    playSound: false,
    soundPath: defaultSoundPath,
    idleConfirmationDelay: 1500,
    skipIfIncompleteTodos: true,
    maxTrackedSessions: 100,
    ...config,
  }

  const hasIncompleteTaskWork = async (_ctx: PluginInput, sessionID: string): Promise<boolean> =>
    hasIncompleteTasksForSession({
      config: pluginConfig,
      directory: ctx.directory,
      sessionID,
      subagentIDs: getSubagentSessionIDs(sessionID),
    })

  const scheduler = createIdleNotificationScheduler({
    ctx,
    platform: currentPlatform,
    config: mergedConfig,
    hasIncompleteTaskWork,
    send: sendSessionNotification,
    playSound: playSessionNotificationSound,
  })

  return async ({ event }: { event: { type: string; properties?: unknown } }) => {
    if (currentPlatform === "unsupported") return

    const props = event.properties as Record<string, unknown> | undefined

    if (event.type === "session.created") {
      const info = props?.info as Record<string, unknown> | undefined
      const sessionID = info?.id as string | undefined
      if (sessionID) {
        scheduler.markSessionActivity(sessionID)
      }
      return
    }

    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return

      if (subagentSessions.has(sessionID)) return

      // Only trigger notifications for the main session (not subagent sessions)
      const mainSessionID = getMainSessionID()
      if (mainSessionID && sessionID !== mainSessionID) return

      scheduler.scheduleIdleNotification(sessionID)
      return
    }

    if (event.type === "message.updated") {
      const info = props?.info as Record<string, unknown> | undefined
      const sessionID = info?.sessionID as string | undefined
      if (sessionID) {
        scheduler.markSessionActivity(sessionID)
      }
      return
    }

    if (event.type === "tool.execute.before" || event.type === "tool.execute.after") {
      const sessionID = props?.sessionID as string | undefined
      if (sessionID) {
        scheduler.markSessionActivity(sessionID)
      }
      return
    }

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined
      if (sessionInfo?.id) {
        scheduler.deleteSession(sessionInfo.id)
      }
    }
  }
}
