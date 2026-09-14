import { log, normalizeSDKResponse } from "../../shared"

export interface SessionOutputClient {
  session: {
    messages: (args: { path: { id: string } }) => Promise<unknown>
  }
}

interface SessionMessagePart {
  type?: string
  text?: string
  content?: string | unknown[]
}

export interface SessionMessage {
  info?: { role?: string; error?: unknown }
  parts?: SessionMessagePart[]
}

/**
 * Fetch the raw messages for a session. Throws on transport failure so callers
 * can decide between fail-open (legacy) and fail-safe (reconciliation).
 */
export async function fetchSessionMessages(
  client: SessionOutputClient,
  sessionID: string,
): Promise<SessionMessage[]> {
  const response = await client.session.messages({ path: { id: sessionID } })
  return normalizeSDKResponse(response, [] as SessionMessage[], { preferResponseOnMissingData: true })
}

/**
 * True when the session produced real assistant/tool output with content.
 * Shared by `validateSessionHasOutput` (manager) and `reconcileHandle`.
 */
export function messagesHaveAssistantOutput(
  messages: SessionMessage[],
  sessionID?: string,
): boolean {
  const hasAssistantOrToolMessage = messages.some(
    (m) => m.info?.role === "assistant" || m.info?.role === "tool",
  )
  if (!hasAssistantOrToolMessage) {
    if (sessionID) log("[background-agent] No assistant/tool messages found in session:", sessionID)
    return false
  }

  const hasContent = messages.some((m) => {
    if (m.info?.role !== "assistant" && m.info?.role !== "tool") return false
    const parts = m.parts ?? []
    return parts.some(
      (p) =>
        (p.type === "text" && p.text && p.text.trim().length > 0) ||
        (p.type === "reasoning" && p.text && p.text.trim().length > 0) ||
        p.type === "tool" ||
        (p.type === "tool_result" &&
          p.content &&
          (typeof p.content === "string" ? p.content.trim().length > 0 : p.content.length > 0)),
    )
  })

  if (!hasContent && sessionID) {
    log("[background-agent] Messages exist but no content found in session:", sessionID)
  }
  return hasContent
}

/** True when any assistant message carries a recorded provider/abort error. */
export function messagesHaveRecordedError(messages: SessionMessage[]): boolean {
  return messages.some((m) => m.info?.role === "assistant" && m.info.error != null)
}

/**
 * Validate that a session has actual assistant/tool output before marking
 * complete. Fail-open: transport errors return true so a flaky lookup cannot
 * block the existing polling/idle completion path.
 */
export async function validateSessionHasOutput(
  client: SessionOutputClient,
  sessionID: string,
): Promise<boolean> {
  try {
    const messages = await fetchSessionMessages(client, sessionID)
    return messagesHaveAssistantOutput(messages, sessionID)
  } catch (error) {
    log("[background-agent] Error validating session output:", error)
    return true
  }
}
