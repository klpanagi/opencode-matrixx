import { log, normalizeSDKResponse } from "../../shared"
import { isAbortedSessionError } from "./error-helpers"
import {
  findNearestMessageExcludingCompaction,
  getMessageDir,
  isCompactionAgent,
} from "./message-dir"
import type { BackgroundTask } from "./types"

export function buildCompletionNotification(
  task: Pick<BackgroundTask, "id" | "description" | "error" | "status">,
  allComplete: boolean,
  completedTasks: Pick<BackgroundTask, "id" | "description">[],
  remainingCount: number,
  duration: string,
  errorInfo: string,
): string {
  if (allComplete) {
    const completedTasksText = completedTasks
      .map((t) => `- \`${t.id}\`: ${t.description}`)
      .join("\n")

    return `<system-reminder>
[ALL BACKGROUND TASKS COMPLETE]

**Completed:**
${completedTasksText || `- \`${task.id}\`: ${task.description}`}

Use \`background_output(task_id="<id>")\` to retrieve each result.
</system-reminder>`
  }

  const statusText =
    task.status === "completed"
      ? "COMPLETED"
      : task.status === "interrupt"
        ? "INTERRUPTED"
        : "CANCELLED"

  return `<system-reminder>
[BACKGROUND TASK ${statusText}]
**ID:** \`${task.id}\`
**Description:** ${task.description}
**Duration:** ${duration}${errorInfo}

**${remainingCount} task${remainingCount === 1 ? "" : "s"} still in progress.** You WILL be notified when ALL complete.
Do NOT poll - continue productive work.

Use \`background_output(task_id="${task.id}")\` to retrieve this result when ready.
</system-reminder>`
}

export async function resolveAgentAndModel(
  client: {
    session: {
      messages: (args: {
        path: { id: string }
      }) => Promise<unknown>
    }
  },
  task: Pick<BackgroundTask, "parentSessionID" | "parentAgent">,
  enableParentSessionNotifications: boolean,
): Promise<{
  agent: string | undefined
  model:
    | { providerID: string; modelID: string }
    | undefined
}> {
  let agent: string | undefined = task.parentAgent
  let model:
    | { providerID: string; modelID: string }
    | undefined 

  if (!enableParentSessionNotifications) {
    return { agent, model }
  }

  try {
    const messagesResp = await client.session.messages({
      path: { id: task.parentSessionID },
    })
    const messages = normalizeSDKResponse(
      messagesResp,
      [] as Array<{
        info?: {
          agent?: string
          model?: { providerID: string; modelID: string }
          modelID?: string
          providerID?: string
        }
      }>,
    )
    for (let i = messages.length - 1; i >= 0; i--) {
      const info = messages[i].info
      if (isCompactionAgent(info?.agent)) {
        continue
      }
      if (
        info?.agent ||
        info?.model ||
        (info?.modelID && info?.providerID)
      ) {
        agent = info.agent ?? task.parentAgent
        model =
          info.model ??
          (info.providerID && info.modelID
            ? {
                providerID: info.providerID,
                modelID: info.modelID,
              }
            : undefined)
        break
      }
    }
  } catch (error) {
    if (isAbortedSessionError(error)) {
      log(
        "[background-agent] Parent session aborted while loading messages; using messageDir fallback:",
        {
          taskParentSessionID: task.parentSessionID,
        },
      )
    }
    const messageDir = getMessageDir(task.parentSessionID)
    const currentMessage = messageDir
      ? findNearestMessageExcludingCompaction(messageDir)
      : null
    agent = currentMessage?.agent ?? task.parentAgent
    model =
      currentMessage?.model?.providerID &&
      currentMessage?.model?.modelID
        ? {
            providerID: currentMessage.model.providerID,
            modelID: currentMessage.model.modelID,
          }
        : undefined
  }

  return { agent, model }
}
