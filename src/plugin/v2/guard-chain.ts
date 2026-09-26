import type { ToolExecuteBeforeHandler } from "./adapters"

/**
 * V2 home of the Matrixx tool guards.
 *
 * On V1 every guard is a V1 tool-before callback (the
 * `V1_HOOK_KEYS.toolExecuteBefore` hook) that denies by THROWING —
 * `rtk rg "permission.ask" src/` returns nothing, so there is no
 * permission-based deny anywhere in the codebase. The V2 runtime has no
 * `permission.ask` hook either; it has `ctx.permission.hook("evaluate")`
 * which mutates a `Permission.Effect`, and that is a different (authorization)
 * semantic used only by `permission-guards.ts`.
 *
 * Therefore every tool guard maps to `ctx.tool.hook("execute.before")` and
 * keeps its throw as the deny mechanism. See
 * .matrixx/notepads/opencode-v1-to-v2-migration/learnings.md — task 3.2.
 */

/** Guard key = the `CreatedHooks` property the V1 factory is stored under. */
export type V2ToolGuardName =
  | "webfetchRedirectGuard"
  | "secretLeakGuard"
  | "envFileWriteGuard"
  | "writeExistingFileGuard"
  | "taskEditGuard"
  | "knowledgeHubGuard"
  | "backgroundTaskBlocker"
  | "bashFileReadGuard"
  | "documentReaderGuard"

export type V2ToolGuardHandlers = Partial<
  Record<V2ToolGuardName, ToolExecuteBeforeHandler>
>

/**
 * Execution order for the V2 guard chain, mirroring the order in which
 * `src/plugin/tool-execute-before.ts` awaits each guard. Wave 6 owns any
 * reordering of the allow/deny/ask tiers — do not reshuffle this tuple.
 *
 * `webfetchRedirectGuard` resolves the webfetch URL before any other hook
 * inspects `output.args`, so it stays first. `bashFileReadGuard` is a
 * non-blocking warning and therefore trails the blocking wave.
 */
export const V2_TOOL_GUARD_ORDER: readonly V2ToolGuardName[] = [
  "webfetchRedirectGuard",
  "secretLeakGuard",
  "envFileWriteGuard",
  "writeExistingFileGuard",
  "taskEditGuard",
  "knowledgeHubGuard",
  "backgroundTaskBlocker",
  "bashFileReadGuard",
  "documentReaderGuard",
] as const

/**
 * Composes the guards into a single before-hook body that preserves both the
 * V1 order and the V1 deny semantics: the first guard that throws aborts the
 * chain, so the tool call is blocked with that guard's own message.
 */
export function createV2GuardChain(
  handlers: V2ToolGuardHandlers
): ToolExecuteBeforeHandler {
  const chain = V2_TOOL_GUARD_ORDER.flatMap((name) => {
    const handler = handlers[name]
    return handler ? [{ name, handler }] : []
  })

  return async (input, output): Promise<void> => {
    for (const guard of chain) {
      await guard.handler(input, output)
    }
  }
}
