import type { PluginContext } from "../../plugin/types"
import { log } from "../../shared/logger"
import {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_LOOP_THRESHOLD,
  DETECT_EVENT_TYPES,
  RESET_TOOL_NAMES,
  SESSION_ID_KEYS,
  TEXT_KEYS,
  TOOL_KEYS,
} from "./constants"
import {
  computeBackoffDelay,
  createNudgeLoopState,
  hashText,
  type NudgeLoopState,
  normalizeNudgeText,
} from "./session-state"

export interface NudgeLoopBreakerOptions {
  threshold?: number
  cooldownMs?: number
  now?: () => number
  onCorrective?: (sessionID: string, backoff: number) => void
}

type EventInput = { event: { type: string; properties?: unknown } }

export type NudgeLoopBreakerHook = { event: (input: EventInput) => Promise<void> }

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function readString(props: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = props[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return undefined
}

function isResetEvent(type: string, props: Record<string, unknown>): boolean {
  if (type === "message.updated" || type === "session.message.updated") {
    return asRecord(props.info).role === "user"
  }
  if (type === "session.next.step.started") {
    return props.role === "user"
  }
  if (type === "session.next.tool.success") {
    const tool = readString(props, TOOL_KEYS)
    return tool !== undefined && RESET_TOOL_NAMES.has(tool)
  }
  return false
}

export function createNudgeLoopBreakerHook(
  ctx: PluginContext,
  options: NudgeLoopBreakerOptions = {},
): NudgeLoopBreakerHook {
  const threshold = options.threshold ?? DEFAULT_LOOP_THRESHOLD
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
  const now = options.now ?? (() => Date.now())
  const onCorrective = options.onCorrective
  const sessions = new Map<string, NudgeLoopState>()

  const sendCorrective = (sessionID: string, state: NudgeLoopState, backoff: number): void => {
    log("[nudge-loop-breaker] Repeated nudge detected", { sessionID, backoff })
    onCorrective?.(sessionID, backoff)

    if (state.correctiveSent || sessionID === "unknown") return
    const prompt = ctx.client?.session?.prompt
    if (typeof prompt !== "function") return
    state.correctiveSent = true
    prompt({
      path: { id: sessionID },
      body: {
        parts: [
          {
            type: "text",
            text: "Repetition detected: stop echoing the prune/compress nudge. Continue the task or run the compress tool with real message IDs.",
          },
        ],
      },
      query: { directory: ctx.directory },
    }).catch((error: unknown) => {
      log("[nudge-loop-breaker] corrective prompt failed", { error })
    })
  }

  return {
    event: async ({ event }) => {
      const props = asRecord(event.properties)
      const sessionID = readString(props, SESSION_ID_KEYS) ?? "unknown"
      const state = sessions.get(sessionID) ?? createNudgeLoopState()
      sessions.set(sessionID, state)

      if (isResetEvent(event.type, props)) {
        state.count = 0
        state.lastHash = null
        state.lastAt = 0
        state.lastEmitAt = 0
        state.correctiveSent = false
        return
      }

      if (!DETECT_EVENT_TYPES.has(event.type)) return

      const text = readString(props, TEXT_KEYS)
      if (!text) return

      const hash = hashText(normalizeNudgeText(text))
      if (hash === state.lastHash) {
        state.count += 1
      } else {
        state.count = 1
        state.lastHash = hash
      }
      state.lastAt = now()

      if (state.count < threshold) return
      if (now() - state.lastEmitAt < cooldownMs) return
      state.lastEmitAt = now()
      sendCorrective(sessionID, state, computeBackoffDelay(state.count, threshold))
    },
  }
}
