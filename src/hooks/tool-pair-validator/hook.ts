import type { Message, Part } from "@opencode-ai/sdk"
import { log } from "../../shared/logger"

const TOOL_RESULT_PLACEHOLDER = "Tool output unavailable (context compacted)"

type ToolUsePart = { type: "tool_use"; id: string; [key: string]: unknown }
type ToolResultPart = { type: "tool_result"; tool_use_id: string; content: string; [key: string]: unknown }
type TransformPart = Part | ToolUsePart | ToolResultPart

type TransformMessageInfo = Message | { role: "user"; sessionID?: string }

interface MessageWithParts {
  info: TransformMessageInfo
  parts: TransformPart[]
}

type MessagesTransformHook = {
  "experimental.chat.messages.transform"?: (
    input: Record<string, never>,
    output: { messages: MessageWithParts[] }
  ) => Promise<void>
}

function getToolUseID(part: TransformPart): string | null {
  const candidate = part as { type?: unknown; id?: unknown; callID?: unknown }
  if (candidate.type === "tool_use" && typeof candidate.id === "string" && candidate.id.length > 0) {
    return candidate.id
  }
  if (candidate.type === "tool" && typeof candidate.callID === "string" && candidate.callID.length > 0) {
    return candidate.callID
  }
  return null
}

function getToolResultID(part: TransformPart): string | null {
  const candidate = part as { type?: unknown; tool_use_id?: unknown }
  if (candidate.type === "tool_result" && typeof candidate.tool_use_id === "string" && candidate.tool_use_id.length > 0) {
    return candidate.tool_use_id
  }
  return null
}

function extractUniqueToolUseIDs(parts: TransformPart[]): string[] {
  const seen = new Set<string>()
  const toolUseIDs: string[] = []
  for (const part of parts) {
    const id = getToolUseID(part)
    if (!id || seen.has(id)) continue
    seen.add(id)
    toolUseIDs.push(id)
  }
  return toolUseIDs
}

function extractToolResultIDs(parts: TransformPart[]): Set<string> {
  const ids = new Set<string>()
  for (const part of parts) {
    const id = getToolResultID(part)
    if (id) ids.add(id)
  }
  return ids
}

function createToolResultPart(toolUseID: string): ToolResultPart {
  return { type: "tool_result", tool_use_id: toolUseID, content: TOOL_RESULT_PLACEHOLDER }
}

function findToolResultInsertIndex(parts: TransformPart[]): number {
  let lastIndex = -1
  for (let i = 0; i < parts.length; i++) {
    if (getToolResultID(parts[i])) lastIndex = i
  }
  return lastIndex === -1 ? 0 : lastIndex + 1
}

function insertMissingToolResults(message: MessageWithParts, missingIDs: string[]): void {
  const insertIndex = findToolResultInsertIndex(message.parts)
  message.parts.splice(insertIndex, 0, ...missingIDs.map(createToolResultPart))
}

function createSyntheticUserMessage(assistantMessage: MessageWithParts, missingIDs: string[]): MessageWithParts {
  const info = assistantMessage.info as { sessionID?: unknown }
  const sessionID = typeof info.sessionID === "string" ? info.sessionID : undefined
  return {
    info: { role: "user", ...(sessionID ? { sessionID } : {}) },
    parts: missingIDs.map(createToolResultPart),
  }
}

function getMessageID(message: TransformMessageInfo): string | undefined {
  const candidate = message as { id?: unknown }
  return typeof candidate.id === "string" ? candidate.id : undefined
}

function repairMissingToolResults(messages: MessageWithParts[], assistantIndex: number): void {
  const assistantMessage = messages[assistantIndex]
  const toolUseIDs = extractUniqueToolUseIDs(assistantMessage.parts)
  if (toolUseIDs.length === 0) return

  const nextMessage = messages[assistantIndex + 1]
  if (nextMessage?.info.role !== "user") {
    messages.splice(assistantIndex + 1, 0, createSyntheticUserMessage(assistantMessage, toolUseIDs))
    log("[tool-pair-validator] Repaired missing tool_result blocks", {
      assistantMessageID: getMessageID(assistantMessage.info),
      syntheticUserMessageInserted: true,
      repairedToolUseIDs: toolUseIDs,
    })
    return
  }

  const existingResultIDs = extractToolResultIDs(nextMessage.parts)
  const missingIDs = toolUseIDs.filter((id) => !existingResultIDs.has(id))
  if (missingIDs.length === 0) return

  insertMissingToolResults(nextMessage, missingIDs)
  log("[tool-pair-validator] Repaired missing tool_result blocks", {
    assistantMessageID: getMessageID(assistantMessage.info),
    syntheticUserMessageInserted: false,
    repairedToolUseIDs: missingIDs,
  })
}

export function createToolPairValidatorHook(): MessagesTransformHook {
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      for (let i = 0; i < output.messages.length; i++) {
        if (output.messages[i].info.role !== "assistant") continue
        repairMissingToolResults(output.messages, i)
      }
    },
  }
}
