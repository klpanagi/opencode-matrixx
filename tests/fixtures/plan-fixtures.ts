import { MAX_PLAN_FILE_BYTES } from "../../src/features/mission-state/constants"

/** A single-char ASCII filler, so one character is exactly one byte. */
const FILLER = "a"

/**
 * Build a plan body of exactly `bytes` UTF-8 bytes, optionally with a leading
 * heading line. Sizes are given as offsets from the cap, never as literals, so a
 * future change to the cap cannot desync the fixtures.
 */
export function buildPlanBodyOfBytes(bytes: number, heading?: string): string {
  if (bytes <= 0) return ""
  const prefix = heading ? `${heading}\n` : ""
  const fill = bytes - Buffer.byteLength(prefix, "utf8")
  if (fill < 0) {
    throw new Error(`heading is ${-fill} bytes larger than the requested body size`)
  }
  return prefix + FILLER.repeat(fill)
}

/** A body `offset` bytes OVER the cap — always rejected by the size guard. */
export function buildOverCapBody(offset = 1, heading?: string): string {
  return buildPlanBodyOfBytes(MAX_PLAN_FILE_BYTES + offset, heading)
}

/** A body `offset` bytes UNDER the cap. */
export function buildUnderCapBody(offset = 0, heading?: string): string {
  return buildPlanBodyOfBytes(MAX_PLAN_FILE_BYTES - offset, heading)
}
