import type { ToolDefinition, ToolContext as V1ToolContext } from "@opencode-ai/plugin"

import type { CreatedHooks } from "../create-hooks"
import type { ToolsRecord, V2ToolContext, V2ToolDefinition, V2ToolResult, V2ToolsRecord } from "./types"

/**
 * Convert a V2-native tool definition into the V1 `ToolDefinition` shape consumed
 * by the V1 `tool` hook. Additive bridge until the V1 runtime is retired.
 */
export function toV1ToolDefinition(tool: V2ToolDefinition): ToolDefinition {
  return {
    description: tool.description,
    args: extractV1Args(tool.input),
    execute: async (args, context) => {
      const result = await tool.execute(args, toV2ToolContext(context))
      return v2ResultToText(result)
    },
  }
}

export function toV1ToolsRecord(tools: V2ToolsRecord): ToolsRecord {
  const converted: ToolsRecord = {}
  for (const [key, tool] of Object.entries(tools)) {
    converted[key] = toV1ToolDefinition(tool)
  }
  return converted
}

/**
 * V2 permits effect `Schema.Codec`/JSON-schema inputs with no `shape`, so the
 * Zod raw shape is extracted defensively and empty when unavailable.
 */
function extractV1Args(input: unknown): ToolDefinition["args"] {
  if (typeof input !== "object" || input === null) return {}
  const shape = (input as { shape?: unknown }).shape
  if (typeof shape !== "object" || shape === null) return {}
  return shape as ToolDefinition["args"]
}

function v2ResultToText(result: V2ToolResult): string {
  if (typeof result.content === "string") return result.content
  if (Array.isArray(result.content)) {
    return result.content.map((part) => (part.type === "text" ? part.text : part.uri)).join("\n")
  }
  if (result.output !== undefined) {
    return typeof result.output === "string" ? result.output : JSON.stringify(result.output)
  }
  return ""
}

/**
 * V1 supplies `abort` and no progress/id; V2 requires `signal`, `progress` and
 * branded ids. The assertion is limited to reconciling those brand types.
 */
function toV2ToolContext(context: V1ToolContext): V2ToolContext {
  return {
    sessionID: context.sessionID,
    messageID: context.messageID,
    agent: context.agent,
    id: context.messageID,
    signal: context.abort,
    progress: async () => undefined,
    directory: context.directory,
    worktree: context.worktree,
    metadata: context.metadata,
    ask: context.ask,
  } as unknown as V2ToolContext
}

export function createToolDefinitionHandler(args: {
  hooks: CreatedHooks
}): (
  input: { toolID: string },
  output: { description: string; parameters: unknown },
) => Promise<void> {
  const { hooks: _hooks } = args

  return async (
    _input: { toolID: string },
    _output: { description: string; parameters: unknown },
  ): Promise<void> => {
  }
}
