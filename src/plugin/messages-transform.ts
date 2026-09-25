import type { Message, Part } from "@opencode-ai/sdk"

import type { CreatedHooks } from "../create-hooks"

type MessageWithParts = {
  info: Message
  parts: Part[]
}

type MessagesTransformOutput = { messages: MessageWithParts[] }

export function _resetMessagesTransformCacheForTesting(): void {
}

export function createMessagesTransformHandler(args: {
  hooks: CreatedHooks
}): (input: Record<string, never>, output: MessagesTransformOutput) => Promise<void> {
  return async (input, output): Promise<void> => {
    await args.hooks.knowledgeHubInjector?.[
      "experimental.chat.messages.transform"
    ]?.(input, output)

    await args.hooks.contextInjectorMessagesTransform?.[
      "experimental.chat.messages.transform"
    ]?.(input, output)

    await args.hooks.envContextInjector?.[
      "experimental.chat.messages.transform"
    ]?.(input, output)

    await args.hooks.thinkingBlockValidator?.[
      "experimental.chat.messages.transform"
    ]?.(input, output)

    await args.hooks.evolutionHitl?.[
      "experimental.chat.messages.transform"
    ]?.(input, output)

    // Ordering: Matrixx runs before DCP (plugin index 0 vs 1), so this sanitizer
    // cleans prior-cycle sticky nudges and caps accumulation at ~1/cycle. It cannot
    // suppress the nudge DCP injects later in the same cycle.
    await args.hooks.dcpNudgeSanitizer?.[
      "experimental.chat.messages.transform"
    ]?.(input, output)

    await args.hooks.toolPairValidator?.[
      "experimental.chat.messages.transform"
    ]?.(input, output)
  }
}
