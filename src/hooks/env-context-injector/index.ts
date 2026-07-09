import type { Message, Part } from "@opencode-ai/sdk"
import { createEnvContext } from "../../agents/env-context"

interface MessageWithParts {
  info: Message
  parts: Part[]
}

type MessagesTransformHook = {
  "experimental.chat.messages.transform"?: (
    input: Record<string, never>,
    output: { messages: MessageWithParts[] }
  ) => Promise<void>
}

/**
 * Env-Context Injector Transform Hook
 *
 * Appends the <matrixx-env> block (date, time, timezone, locale, year)
 * to the last user message in each turn.
 *
 * This ensures the system prompt (agent config) is 100% static and
 * byte-identical across all turns in a session, enabling provider-side
 * prefix caching (Anthropic prompt caching, DeepSeek KV cache, OpenAI
 * auto-cache).
 */
export function createEnvContextInjectorHook(): MessagesTransformHook {
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      const { messages } = output
      if (!messages || messages.length === 0) return

      // Walk in reverse to find the last user message
      let lastUserMessageIndex = -1
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].info.role === "user") {
          lastUserMessageIndex = i
          break
        }
      }
      if (lastUserMessageIndex === -1) return

      const lastUserMessage = messages[lastUserMessageIndex]
      const envContext = createEnvContext()

      // Find the last text part to append env context
      const textPartIndex = lastUserMessage.parts.findIndex(
        (p) => p.type === "text" && typeof (p as { text?: string }).text === "string"
      )

      if (textPartIndex === -1) {
        // No text part — create one
        lastUserMessage.parts.push({
          type: "text",
          text: envContext,
          id: `env_ctx_${Date.now()}`,
          messageID: lastUserMessage.info.id,
          sessionID: (lastUserMessage.info as { sessionID?: string }).sessionID ?? "",
        } as Part)
        return
      }

      const textPart = lastUserMessage.parts[textPartIndex] as { text: string; type: string }
      textPart.text = `${textPart.text}\n\n${envContext}`
    },
  }
}
