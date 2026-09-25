/**
 * DCP Sticky-Nudge Sanitizer Hook
 *
 * Ordering constraint (do not "fix" by assuming otherwise):
 * Matrixx registers `experimental.chat.messages.transform` BEFORE DCP (plugin
 * index 0 vs 1), so this sanitizer runs before DCP injects this cycle's nudge.
 * It therefore cleans PRIOR-cycle sticky nudge parts and caps accumulation at
 * ~1 per cycle. It CANNOT suppress the nudge DCP injects later in the SAME
 * cycle. Full same-cycle suppression requires the optional deploy step that
 * reorders the `plugin` array so Matrixx runs after DCP.
 */

import type { Part } from "@opencode-ai/sdk"

import type { PluginContext } from "../../plugin/types"
import { NUDGE_MARKERS, normalizeNudgeText } from "./constants"

interface MessageWithParts {
  info: unknown
  parts: Part[]
}

type MessagesTransformHook = {
  "experimental.chat.messages.transform"?: (
    input: Record<string, never>,
    output: { messages: MessageWithParts[] },
  ) => Promise<void>
}

function getTextPart(part: Part): { text: string } | null {
  const candidate = part as { type?: unknown; text?: unknown }
  if (candidate.type === "text" && typeof candidate.text === "string") {
    return { text: candidate.text }
  }
  return null
}

function isNudgeText(text: string): boolean {
  return NUDGE_MARKERS.some((marker) => marker.test(text))
}

export function sanitizeNudgeParts(messages: MessageWithParts[]): void {
  let keptNudge = false
  for (const message of messages) {
    if (!Array.isArray(message.parts)) continue
    for (let i = 0; i < message.parts.length; ) {
      const textPart = getTextPart(message.parts[i])
      if (!textPart || !isNudgeText(textPart.text)) {
        i++
        continue
      }
      if (keptNudge) {
        message.parts.splice(i, 1)
        continue
      }
      keptNudge = true
      ;(message.parts[i] as { text: string }).text = normalizeNudgeText(textPart.text)
      i++
    }
  }
}

export function createDcpNudgeSanitizerHook(_ctx: PluginContext): MessagesTransformHook {
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      sanitizeNudgeParts(output.messages)
    },
  }
}
