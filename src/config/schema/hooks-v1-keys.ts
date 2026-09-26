/**
 * Legacy V1 plugin hook keys — the ONLY module allowed to spell the V1 hook
 * name literals.
 *
 * Every other module imports the keys from here. During the V1→V2 migration
 * the V1 runtime still dispatches on these names (the ~80 hook factories in
 * `src/hooks/` return objects keyed by them), so the names cannot disappear
 * yet — isolating them in one file keeps the burn-down measurable and gives
 * Wave 10 a single place to delete.
 *
 * The literal strings live in the data module `hooks-v1-to-v2.json` — the same
 * table `hooks.ts` already builds `HookNameSchema` from — so this module is a
 * thin, fully typed view over it rather than a second copy of the vocabulary.
 * `Object.keys()` supplies the runtime values, `keyof` the literal types.
 *
 * @see .matrixx/plans/opencode-v1-to-v2-migration.md — task 3.1
 * @see src/plugin/v2/register-hooks.ts — the V2 equivalents
 */
import V1_TO_V2_NAMES from "./hooks-v1-to-v2.json"

export type V1HookName = keyof typeof V1_TO_V2_NAMES

/** Turns a dotted hook name into its camelCase alias: `a.b.c` → `aBC`. */
type CamelCase<S extends string> = S extends `${infer Head}.${infer Rest}`
  ? `${Head}${Capitalize<CamelCase<Rest>>}`
  : S

function camelize(name: string): string {
  return name
    .split(".")
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("")
}

/** V1 hook names keyed by camelCase alias, each keeping its literal type. */
const V1_HOOK_NAMES = Object.fromEntries(
  (Object.keys(V1_TO_V2_NAMES) as V1HookName[]).map((name) => [camelize(name), name]),
) as { readonly [K in V1HookName as CamelCase<K>]: K }

export const V1_HOOK_KEYS = {
  chatMessage: V1_HOOK_NAMES.chatMessage,
  chatParams: V1_HOOK_NAMES.chatParams,
  toolExecuteBefore: V1_HOOK_NAMES.toolExecuteBefore,
  toolExecuteAfter: V1_HOOK_NAMES.toolExecuteAfter,
  /** Historical alias for the experimental messages-transform hook. */
  messagesTransform: V1_HOOK_NAMES.experimentalChatMessagesTransform,
  /** Historical alias for the experimental session-compacting hook. */
  sessionCompacting: V1_HOOK_NAMES.experimentalSessionCompacting,
} as const

export type V1HookKey = (typeof V1_HOOK_KEYS)[keyof typeof V1_HOOK_KEYS]
