import type { Hooks, PluginInput } from "@opencode-ai/plugin"

import { log } from "../../shared"
import { BLOCKED_PATTERNS, HOOK_NAME } from "./constants"

export function createTaskEditGuardHook(ctx: PluginInput): Hooks {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool?.toLowerCase() !== "bash") return

      const args = output.args as unknown as Record<string, unknown>
      const cmd = args?.command as string | undefined
      if (!cmd) return

      // Allow read-only grep without mutation: e.g. grep -r ".matrixx/plans"
      // Only block when a mutation tool (sed/python/etc.) is present alongside the path.
      const lower = cmd.toLowerCase()
      if (lower.includes("grep") && !lower.includes("sed") && !lower.includes("python")) {
        // Quick allow for pure grep reads — none of the BLOCKED_PATTERNS should hit anyway,
        // but keep an explicit fast-path to avoid false positives if patterns evolve.
        const isOnlyGrep = BLOCKED_PATTERNS.every((rx) => !rx.test(cmd))
        if (isOnlyGrep) return
      }

      const hit = BLOCKED_PATTERNS.some((rx) => rx.test(cmd))
      if (!hit) return

      // ctx.directory is available for absolute-path resolution if needed;
      // substring match on ".matrixx/plans" / ".matrixx/tasks" already covers absolute paths.
      void ctx.directory

      log(`[${HOOK_NAME}] BLOCKED raw bash edit`, {
        sessionID: input.sessionID,
        command: cmd.slice(0, 120),
      })

      throw new Error(
        "Blocked: raw bash edit to plan/task files. " +
          "Use Edit (hashline IDs) for .matrixx/plans/*.md and task_create/task_update/task_cleanup for .matrixx/tasks/T-*.json — raw bash sed/python bypasses project-scoped task system",
      )
    },
  }
}
