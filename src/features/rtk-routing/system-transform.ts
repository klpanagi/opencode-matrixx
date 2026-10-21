import type { Hooks } from "@opencode-ai/plugin"

import type { MatrixxConfig } from "../../config"
import { getAvailableToolNames } from "../../plugin-handlers/agent-config-handler"
import { resolveRtkEnforcement } from "../../shared/rtk-enforcement"
import { buildRtkRoutingBlock, containsRtkMarker } from "./routing-block"

export const HOOK_NAME = "rtk-routing"

/** Insert position: right after the first (primary) system message. */
const INSERT_INDEX = 1

type SystemTransformHandler = NonNullable<Hooks["experimental.chat.system.transform"]>

export interface RtkSystemTransformOptions {
  hookEnabled?: boolean
  hasBash?: (agentName?: string) => boolean
  which?: (binary: string) => string | null
}

/**
 * Default bash probe backed by the single existing available-tool-names
 * signal (set once at startup by index.ts via setAvailableToolNames).
 * Suppresses only when affirmatively known to lack bash: a non-empty
 * registry without "bash" means no agent can run shell commands, so the
 * discipline block is noise. An empty registry means identity/tooling is
 * unknown — default to INJECT in that case.
 */
function defaultHasBash(): boolean {
  const names = getAvailableToolNames()
  if (names.length === 0) return true
  return names.includes("bash")
}

/**
 * Builds the `experimental.chat.system.transform` handler that injects the
 * RTK shell-discipline routing block into every system prompt.
 *
 * Fail-open by design: the hook is guidance, never enforcement, so any error
 * (malformed output, unexpected SDK shape) returns without throwing and
 * simply leaves the prompt untouched.
 *
 * Seams (test-only overrides, never production paths):
 * - `which` — injected binary probe, forwarded to the resolver so tests can
 *   simulate a present binary without touching PATH.
 * - `hookEnabled` — captured at factory time alongside the resolver result;
 *   lets tests flip the gate without touching hook config.
 * - `hasBash` — per-agent bash probe; receives the agent name when the
 *   caller knows it, defaults to the global available-tool-names signal.
 */
export function createRtkSystemTransformHook(
  pluginConfig: MatrixxConfig,
  opts?: RtkSystemTransformOptions,
): SystemTransformHandler {
  const { active } = resolveRtkEnforcement(pluginConfig.rtk, {
    hookEnabled: opts?.hookEnabled,
    which: opts?.which,
  })
  const routingBlock = buildRtkRoutingBlock()
  const hasBash = opts?.hasBash ?? defaultHasBash

  return async (input, output): Promise<void> => {
    try {
      if (!active) return
      // Title-generation and other session-less calls must not carry the block.
      if (!input?.sessionID) return
      if (!Array.isArray(output?.system)) return
      if (containsRtkMarker(output.system)) return
      // Per-agent suppression: skip agents affirmatively known to lack bash.
      if (!hasBash()) return

      output.system.splice(Math.min(INSERT_INDEX, output.system.length), 0, routingBlock)
    } catch {
      return
    }
  }
}
