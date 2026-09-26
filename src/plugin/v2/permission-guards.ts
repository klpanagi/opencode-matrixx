import type { PermissionEvaluation } from "@opencode/plugin/promise/permission"
import { type PermissionRule, resolvePermissionEffect } from "./permission-policy"

export type PermissionEvaluateHandler = (
  evaluation: PermissionEvaluation
) => Promise<void> | void

/**
 * The one deny in Matrixx that is genuinely an authorization decision rather
 * than an input-shape policy: a read-only agent (e.g. `sentinel`) must not
 * mutate the workspace. On V1 that is expressed as static agent config via
 * `createAgentToolRestrictions` in `src/shared/permission-compat.ts`, which the
 * V2 runtime reads at agent-config time and therefore cannot re-evaluate per
 * tool call. `ctx.permission.hook("evaluate")` is the V2 mechanism that
 * mutates a `Permission.Effect`, so this is where the runtime half of that
 * restriction belongs.
 *
 * Un-scoped (applies to every agent) and resolved through the same
 * deny-precedence engine as `experimental.policies`, so there is exactly one
 * permission resolution implementation in the codebase.
 */
export function createReadOnlyPermissionGuard(args: {
  deniedTools: readonly string[]
  message: string
}): PermissionEvaluateHandler {
  const rule: PermissionRule = {
    effect: "deny",
    tools: args.deniedTools,
    reason: args.message,
  }

  return (evaluation) => {
    const resolution = resolvePermissionEffect([rule], { action: evaluation.action })
    if (!resolution) return
    evaluation.effect = resolution.effect
    evaluation.message = args.message
  }
}
