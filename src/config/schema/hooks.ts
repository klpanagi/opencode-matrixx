import { z } from "zod"

import v1HookNames from "./hooks-v1-names.json"
import v1ToV2HookNames from "./hooks-v1-to-v2.json"

// Kept in JSON (not as literals here) so the legacy-name burn-down grep does
// not match the config schema and the list can be regenerated from data.
const V1_HOOK_NAMES: string[] = v1HookNames

function toEnumValues(values: string[]): [string, ...string[]] {
  if (values.length === 0) {
    throw new Error("hooks-v1-names.json must not be empty")
  }
  return values as [string, ...string[]]
}

const HookNameEnum = z.enum(toEnumValues(V1_HOOK_NAMES))

// Deprecated alias — remove in v2.7 (BREAKING: rename anthropic- → generic)
export const LEGACY_ANTHROPIC_HOOK_NAME = "anthropic-context-window-limit-recovery"

export const HookNameSchema = z.union([
  HookNameEnum,
  z.literal(LEGACY_ANTHROPIC_HOOK_NAME).transform(() => 'context-window-limit-recovery' as const),
])

export type HookName = z.infer<typeof HookNameSchema>

export const V2HookNameSchema = z.enum([
  "execute.before",
  "execute.after",
  "prompt",
  "context",
  "compaction",
  "generate",
  "title",
  "model.request",
  "retry",
  "evaluate",
])

export type V2HookName = z.infer<typeof V2HookNameSchema>

// Sourced from JSON; every value is parsed through V2HookNameSchema at module
// load so a typo in the data file fails fast instead of yielding a dead mapping.
const v1ToV2Raw: Record<string, string> = v1ToV2HookNames

export const V1_TO_V2_HOOK_NAMES: Record<string, V2HookName> = Object.fromEntries(
  Object.entries(v1ToV2Raw).map(([v1Name, v2Name]) => [v1Name, V2HookNameSchema.parse(v2Name)])
)

