import type { createChatMessageHandler } from "../chat-message"
import type { CompactionInput, CompactionOutput } from "../compaction"
import type { createEventHandler } from "../event"
import type { createMessagesTransformHandler } from "../messages-transform"
import type { createToolExecuteAfterHandler } from "../tool-execute-after"
import type { createToolExecuteBeforeHandler } from "../tool-execute-before"
import type {
  V2CompactionInput,
  V2ContextInput,
  V2EventItem,
  V2PromptInput,
  V2ToolAfterInput,
  V2ToolBeforeInput,
  V2ToolCompletedResult,
} from "./v2-hook-types"

export type ToolExecuteBeforeHandler = ReturnType<typeof createToolExecuteBeforeHandler>
export type ToolExecuteAfterHandler = ReturnType<typeof createToolExecuteAfterHandler>
export type ChatMessageHandler = ReturnType<typeof createChatMessageHandler>
export type MessagesTransformHandler = ReturnType<typeof createMessagesTransformHandler>
export type EventHandler = ReturnType<typeof createEventHandler>
export type CompactionHandler = (
  input: CompactionInput,
  output: CompactionOutput
) => Promise<void>

type BeforeInput = Parameters<ToolExecuteBeforeHandler>[0]
type BeforeOutput = Parameters<ToolExecuteBeforeHandler>[1]
type AfterInput = Parameters<ToolExecuteAfterHandler>[0]
type AfterOutput = Parameters<ToolExecuteAfterHandler>[1]
type ChatMessageInput = Parameters<ChatMessageHandler>[0]
type ChatMessageOutput = Parameters<ChatMessageHandler>[1]
type MessagesTransformOutput = Parameters<MessagesTransformHandler>[1]
type EventInput = Parameters<EventHandler>[0]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function toToolBeforeCall(input: V2ToolBeforeInput): {
  input: BeforeInput
  output: BeforeOutput
} {
  return {
    input: { tool: input.tool, sessionID: input.sessionID, callID: input.id },
    // The same object reference, so V1 hook mutations to `args` are visible to
    // the V2 runtime that owns the tool input.
    output: { args: isRecord(input.input) ? input.input : {} },
  }
}

export function toToolAfterCall(input: V2ToolAfterInput): {
  input: AfterInput
  output: AfterOutput
} {
  const call = { tool: input.tool, sessionID: input.sessionID, callID: input.id }
  if (input.status !== "completed") {
    return { input: call, output: undefined }
  }
  return {
    input: call,
    output: {
      // V2 `Tool.Result` carries no title; the V1 after-hooks treat the title as
      // the tool label, and the stored-metadata path overwrites it when set.
      title: input.tool,
      output: toOutputText(input.result),
      metadata: isRecord(input.result.metadata) ? input.result.metadata : {},
    },
  }
}

function toOutputText(result: V2ToolCompletedResult): string {
  if (typeof result.content === "string") return result.content
  if (typeof result.output === "string") return result.output
  return result.output === undefined ? "" : JSON.stringify(result.output)
}

export function toChatMessageCall(input: V2PromptInput): {
  input: ChatMessageInput
  output: ChatMessageOutput
} {
  return {
    input: { sessionID: input.sessionID },
    // V1 mutated `output.message` in place; V2 exposes the prompt as a mutable
    // object, so the same reference is handed over and V1 writes land in V2.
    output: { message: input.prompt, parts: [] },
  }
}

export function toMessagesTransformCall(_input: V2ContextInput): {
  input: Record<string, never>
  output: MessagesTransformOutput
} {
  // V2 `Message` has no V1 `{ info, parts }` envelope, so there is nothing to
  // hand the V1 transform hooks yet. See issues.md — context injection on the
  // V2 path is blocked on a Message converter (post task 3.1).
  return { input: {}, output: { messages: [] } }
}

export async function runCompactionCall(
  input: V2CompactionInput,
  handler: CompactionHandler | undefined
): Promise<void> {
  const output: CompactionOutput = { context: [] }
  await handler?.({ sessionID: input.sessionID }, output)
  for (const text of output.context) {
    input.system.push({ type: "text", text })
  }
  // No reload: the V2 SessionDomain exposes neither `transform` nor `reload`,
  // and `system` is mutated in place, so the provider driver sees the additions.
}

export function toEventCall(event: V2EventItem): EventInput {
  return {
    event: {
      type: event.type,
      properties: isRecord(event.data) ? (event.data as Record<string, unknown>) : undefined,
    },
  }
}
