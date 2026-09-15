import { existsSync } from "node:fs"
import { type ToolDefinition, tool } from "@opencode-ai/plugin"
import { getHandlePath } from "../../features/background-agent/handle-index"
import { formatReviveOutcome, formatUnrevivable } from "../../shared/revive-outcome"
import { BACKGROUND_REVIVE_DESCRIPTION } from "./constants"
import type { BackgroundReviveArgs, BackgroundReviveManager } from "./types"

type RevivableEntry = {
  taskId: string
  description: string
  agent: string
  status: string
  sessionID: string
  terminalReason?: string
}

function formatListing(entries: RevivableEntry[]): string {
  if (entries.length === 0) {
    return `No revivable background tasks found.

Handles are retained for 30 minutes after a task reaches a terminal state.`
  }

  const rows = entries
    .map(
      (entry) =>
        `| \`${entry.taskId}\` | ${entry.description} | ${entry.agent} | ${entry.status} | ${entry.terminalReason ?? "-"} | \`${entry.sessionID}\` |`,
    )
    .join("\n")

  return `Revivable background tasks (${entries.length}):

| Task ID | Description | Agent | Status | Reason | Session ID |
|---------|-------------|-------|--------|--------|------------|
${rows}

Revive one with background_revive(taskId="<id>", prompt="<new instruction>").`
}

/**
 * Map a rejection from `BackgroundManager.revive()` onto a machine-readable
 * reason. The manager throws human-readable messages; the stable substrings
 * below are the contract between the two layers.
 */
function resolveFailure(
  identifier: string,
  message: string,
  directory: string,
): { reason: string; detail: string } {
  if (message.includes("not found for revive")) {
    const handleOnDisk = existsSync(getHandlePath(directory, identifier))
    return { reason: handleOnDisk ? "unknown-task" : "expired", detail: message }
  }
  if (message.includes("still active")) return { reason: "active", detail: message }
  if (message.includes("unknown liveness")) return { reason: "uncertain", detail: message }
  if (message.includes("no session to revive") || message.includes("has no sessionID")) {
    return { reason: "no-session", detail: message }
  }
  return { reason: "unknown-task", detail: message }
}

export function createBackgroundRevive(
  manager: BackgroundReviveManager,
  directory: string,
): ToolDefinition {
  return tool({
    description: BACKGROUND_REVIVE_DESCRIPTION,
    args: {
      taskId: tool.schema.string().optional().describe("Task ID to revive (provide this or session_id)"),
      session_id: tool.schema.string().optional().describe("Session ID of the task to revive (alternative to taskId)"),
      prompt: tool.schema
        .string()
        .optional()
        .describe("NEW instruction for the revived session (required unless list=true)"),
      list: tool.schema.boolean().optional().describe("List revivable tasks instead of reviving one (default: false)"),
      force: tool.schema
        .boolean()
        .optional()
        .describe("Acknowledge unknown liveness for statusUncertain tasks (default: false)"),
      parentSessionID: tool.schema.string().optional().describe("Restrict discovery to this parent session"),
    },
    async execute(args: BackgroundReviveArgs, toolContext) {
      const isListing = args.list === true || (args.taskId === undefined && args.session_id === undefined)

      if (isListing) {
        return formatListing(manager.listRevivable(args.parentSessionID ?? toolContext.sessionID))
      }

      const identifier = (args.taskId ?? args.session_id) as string

      if (args.prompt === undefined || args.prompt.trim().length === 0) {
        return formatUnrevivable(identifier, "unknown-task", "a prompt is required to revive a task")
      }

      try {
        const task = await manager.revive({
          taskId: args.taskId,
          sessionId: args.session_id,
          prompt: args.prompt,
          parentSessionID: toolContext.sessionID,
          parentMessageID: toolContext.messageID,
          force: args.force,
        })
        return formatReviveOutcome(task.id, task.sessionID ?? "", task.status)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const { reason, detail } = resolveFailure(identifier, message, directory)
        return formatUnrevivable(identifier, reason, detail)
      }
    },
  })
}
