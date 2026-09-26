import type { BackgroundManager } from "../../features/background-agent"
import { resolveSessionSteering } from "../../features/session-steering"
import type { PluginContext } from "../../plugin/types"
import { log } from "../../shared/logger"
import { HOOK_NAME } from "./hook-name"
import { resolveRecentModelForSession } from "./recent-model-resolver"
import { MISSION_CONTINUATION_PROMPT } from "./system-reminder-templates"
import type { SessionState } from "./types"

export async function injectMissionContinuation(input: {
  ctx: PluginContext
  sessionID: string
  planName: string
  remaining: number
  total: number
  agent?: string
  backgroundManager?: BackgroundManager
  sessionState: SessionState
}): Promise<void> {
  const {
    ctx,
    sessionID,
    planName,
    remaining,
    total,
    agent,
    backgroundManager,
    sessionState,
  } = input

  const hasRunningBgTasks = backgroundManager
    ? backgroundManager.getTasksByParentSession(sessionID).some((t: { status: string }) => t.status === "running")
    : false

  if (hasRunningBgTasks) {
    log(`[${HOOK_NAME}] Skipped injection: background tasks running`, { sessionID })
    return
  }

  const prompt =
    MISSION_CONTINUATION_PROMPT.replace(/{PLAN_NAME}/g, planName) +
    `\n\n[Status: ${total - remaining}/${total} completed, ${remaining} remaining]`

  try {
    log(`[${HOOK_NAME}] Injecting mission continuation`, { sessionID, planName, remaining })

    const model = await resolveRecentModelForSession(ctx, sessionID)

    await resolveSessionSteering(ctx).deliver({
      sessionID,
      text: prompt,
      directory: ctx.directory,
      agent: agent ?? "architect",
      ...(model !== undefined ? { model } : {}),
    })

    sessionState.promptFailureCount = 0
    log(`[${HOOK_NAME}] Mission continuation injected`, { sessionID })
  } catch (err) {
    sessionState.promptFailureCount += 1
    log(`[${HOOK_NAME}] Mission continuation failed`, {
      sessionID,
      error: String(err),
      promptFailureCount: sessionState.promptFailureCount,
    })
  }
}
