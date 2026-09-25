import { DEFAULT_LOOP_THRESHOLD, DSML_PATTERNS, MAX_BACKOFF_EXPONENT } from "./constants"

export interface NudgeLoopState {
  count: number
  lastHash: string | null
  lastAt: number
  lastEmitAt: number
  correctiveSent: boolean
}

export function createNudgeLoopState(): NudgeLoopState {
  return { count: 0, lastHash: null, lastAt: 0, lastEmitAt: 0, correctiveSent: false }
}

export function computeBackoffDelay(
  count: number,
  threshold: number = DEFAULT_LOOP_THRESHOLD,
): number {
  if (count < threshold) return 0
  return 2 ** Math.min(count - threshold, MAX_BACKOFF_EXPONENT)
}

export function hashText(text: string): string {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

export function normalizeNudgeText(text: string): string {
  let normalized = text
  for (const pattern of DSML_PATTERNS) {
    normalized = normalized.replace(pattern, "")
  }
  return normalized.replace(/\s+/g, " ").trim()
}
