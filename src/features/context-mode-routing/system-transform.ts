import type { Hooks } from "@opencode-ai/plugin"

import type { MatrixxConfig } from "../../config"
import { resolveContextModeEnforcement } from "../../shared/context-mode-enforcement"
import { buildContextModeRoutingBlock, containsContextModeMarker } from "./routing-block"

export const HOOK_NAME = "context-mode-routing"

/** Insert position: right after the first (primary) system message. */
const INSERT_INDEX = 1

type SystemTransformHandler = NonNullable<Hooks["experimental.chat.system.transform"]>

/**
 * Builds the `experimental.chat.system.transform` handler that injects the
 * context-mode routing block into every system prompt.
 *
 * Fail-open by design: the hook is guidance, never enforcement, so any error
 * (malformed output, unexpected SDK shape) returns without throwing and simply
 * leaves the prompt untouched.
 */
export function createContextModeSystemTransformHook(pluginConfig: MatrixxConfig): SystemTransformHandler {
  const { enabled } = resolveContextModeEnforcement(pluginConfig.context_mode)
  const routingBlock = buildContextModeRoutingBlock()

  return async (input, output): Promise<void> => {
    try {
      if (!enabled) return
      // Title-generation and other session-less calls must not carry the block.
      if (!input?.sessionID) return
      if (!Array.isArray(output?.system)) return
      if (containsContextModeMarker(output.system)) return

      output.system.splice(Math.min(INSERT_INDEX, output.system.length), 0, routingBlock)
    } catch {
      return
    }
  }
}
