import type { Message, Part } from "@opencode-ai/sdk"

import { V1_HOOK_KEYS } from "../config/schema/hooks-v1-keys"
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
    await args.hooks.knowledgeHubInjector?.[V1_HOOK_KEYS.messagesTransform]?.(input, output)

    await args.hooks.contextInjectorMessagesTransform?.[V1_HOOK_KEYS.messagesTransform]?.(input, output)

    await args.hooks.envContextInjector?.[V1_HOOK_KEYS.messagesTransform]?.(input, output)

    await args.hooks.thinkingBlockValidator?.[V1_HOOK_KEYS.messagesTransform]?.(input, output)

    await args.hooks.evolutionHitl?.[V1_HOOK_KEYS.messagesTransform]?.(input, output)

    // Ordering: Matrixx runs before DCP (plugin index 0 vs 1), so this sanitizer
    // cleans prior-cycle sticky nudges and caps accumulation at ~1/cycle. It cannot
    // suppress the nudge DCP injects later in the same cycle.
    await args.hooks.dcpNudgeSanitizer?.[V1_HOOK_KEYS.messagesTransform]?.(input, output)

    await args.hooks.toolPairValidator?.[V1_HOOK_KEYS.messagesTransform]?.(input, output)
  }
}
