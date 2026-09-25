export const DEFAULT_LOOP_THRESHOLD = 3
export const DEFAULT_COOLDOWN_MS = 1000
export const MAX_BACKOFF_EXPONENT = 5

// Fullwidth vertical bar (U+FF5C) used by DSML sequences. Data-driven list:
// the detector strips these patterns without branching on a model/provider.
export const DSML_PATTERNS: RegExp[] = [/｜/g]

export const SESSION_ID_KEYS = ["sessionID", "sessionId", "session"] as const
export const TEXT_KEYS = [
  "text",
  "content",
  "message",
  "assistantText",
  "snapshot",
  "assistantMessageID",
] as const
export const TOOL_KEYS = ["tool", "toolName", "name"] as const

export const RESET_TOOL_NAMES = new Set(["compress"])
export const DETECT_EVENT_TYPES = new Set(["session.next.step.ended", "session.next.step.failed"])
