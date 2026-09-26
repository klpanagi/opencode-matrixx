import { z } from "zod"
import type { BackgroundManager } from "../../features/background-agent"
import type { V2ToolDefinition } from "../../plugin/types"
import type { BackgroundCancelClient } from "./clients"
import { BACKGROUND_CANCEL_DESCRIPTION } from "./constants"
import type { BackgroundCancelArgs } from "./types"

export function createBackgroundCancel(manager: BackgroundManager, _client: BackgroundCancelClient): V2ToolDefinition {
  return {
    name: "background_cancel",
    description: BACKGROUND_CANCEL_DESCRIPTION,
    input: z.object({
      taskId: z.string().optional().describe("Task ID to cancel (required if all=false)"),
      all: z.boolean().optional().describe("Cancel all running background tasks (default: false)"),
    }),
    async execute(args: BackgroundCancelArgs, toolContext) {
      try {
        const cancelAll = args.all === true

        if (!cancelAll && !args.taskId) {
          return { content: await (`[ERROR] Invalid arguments: Either provide a taskId or set all=true to cancel all running tasks.`) }
        }

        if (cancelAll) {
          const tasks = manager.getAllDescendantTasks(toolContext.sessionID)
          const cancellableTasks = tasks.filter((t: { status: string }) => t.status === "running" || t.status === "pending")

          if (cancellableTasks.length === 0) {
            return { content: await (`No running or pending background tasks to cancel.`) }
          }

          const cancelledInfo: Array<{ id: string; description: string; status: string; sessionID?: string }> = []

          for (const task of cancellableTasks) {
            const originalStatus = task.status
            const cancelled = await manager.cancelTask(task.id, {
              source: "background_cancel",
              abortSession: originalStatus === "running",
              skipNotification: true,
            })
            if (!cancelled) continue
            cancelledInfo.push({
              id: task.id,
              description: task.description,
              status: originalStatus === "pending" ? "pending" : "running",
              sessionID: task.sessionID,
            })
          }

          const tableRows = cancelledInfo
            .map(
              (t) =>
                `| \`${t.id}\` | ${t.description} | ${t.status} | ${t.sessionID ? `\`${t.sessionID}\`` : "(not started)"} |`
            )
            .join("\n")

          const resumableTasks = cancelledInfo.filter((t) => t.sessionID)
          const resumeSection =
            resumableTasks.length > 0
              ? `\n## Continue Instructions

To continue a cancelled task, use:
\`\`\`
task(session_id="<session_id>", prompt="Continue: <your follow-up>")
\`\`\`

Continuable sessions:
${resumableTasks.map((t) => `- \`${t.sessionID}\` (${t.description})`).join("\n")}`
              : ""

          const runningCount = cancelledInfo.filter((t) => t.status === "running").length
          const warning =
            runningCount > 0
              ? `\n\n> ⚠️ ${runningCount} running task(s) were cancelled. Consider using \`background_wait_all(timeout=30000)\` before \`background_cancel(all=true)\` to let tasks finish naturally.`
              : ""

          return { content: await (`Cancelled ${cancelledInfo.length} background task(s):

| Task ID | Description | Status | Session ID |
|---------|-------------|-------|------------|
${tableRows}
${resumeSection}${warning}`) }
        }

        const task = manager.getTask(args.taskId as string)
        if (!task) {
          return { content: await (`[ERROR] Task not found: ${args.taskId}`) }
        }

        if (task.status !== "running" && task.status !== "pending") {
          return { content: await (`[ERROR] Cannot cancel task: current status is "${task.status}".
Only running or pending tasks can be cancelled.`) }
        }

        const cancelled = await manager.cancelTask(task.id, {
          source: "background_cancel",
          abortSession: task.status === "running",
          skipNotification: true,
        })
        if (!cancelled) {
          return { content: await (`[ERROR] Failed to cancel task: ${task.id}`) }
        }

        if (task.status === "pending") {
          return { content: await (`Pending task cancelled successfully

Task ID: ${task.id}
Description: ${task.description}
Status: ${task.status}`) }
        }

        return { content: await (`Task cancelled successfully

Task ID: ${task.id}
Description: ${task.description}
Session ID: ${task.sessionID}
Status: ${task.status}`) }
      } catch (error) {
        return { content: await (`[ERROR] Error cancelling task: ${error instanceof Error ? error.message : String(error)}`) }
      }
    },
  }
}
