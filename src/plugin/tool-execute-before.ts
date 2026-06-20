import type { PluginContext } from "./types"

import { getMainSessionID } from "../features/claude-code-session-state"
import { clearMissionState } from "../features/mission-state"
import { log } from "../shared"
import { resolveSessionAgent } from "./session-agent-resolver"

import type { CreatedHooks } from "../create-hooks"

export function createToolExecuteBeforeHandler(args: {
  ctx: PluginContext
  hooks: CreatedHooks
}): (
  input: { tool: string; sessionID: string; callID: string },
  output: { args: Record<string, unknown> },
) => Promise<void> {
  const { ctx, hooks } = args

  return async (input, output): Promise<void> => {
    // ---------------------------------------------------------------------
    // Fast-fail hooks (Task T1.1: 3-wave parallelization)
    //
    // The 15 hook calls below are grouped into 3 sequential waves based on
    // their mutation/throwing profile. See `hook-mutation-classification.md`
    // for the full analysis. Waves execute strictly in order (1 -> 2 -> 3);
    // within a wave, hooks run concurrently.
    //
    // Wave 1 (5 hooks): pure READ_ONLY — no mutation, no I/O, no throws.
    //   Safe to parallelize via Promise.all. Either no-op in tool.execute.before
    //   (directory*, rulesInjector) or only write to a private in-memory Map
    //   keyed by callID (qualityGate, commentChecker). No shared state with
    //   other hooks in the wave.
    await Promise.all([
      hooks.qualityGate?.["tool.execute.before"]?.(input, output),
      hooks.commentChecker?.["tool.execute.before"]?.(input, output),
      hooks.directoryAgentsInjector?.["tool.execute.before"]?.(input, output),
      hooks.directoryReadmeInjector?.["tool.execute.before"]?.(input, output),
      hooks.rulesInjector?.["tool.execute.before"]?.(input, output),
    ])

    // Wave 2 (5 hooks): fail-fast BLOCKING — each guard throws on a
    //   DIFFERENT condition for a DIFFERENT tool; no two guards fire on
    //   the same input. Use Promise.allSettled so we can re-throw the
    //   first rejection explicitly (Promise.all would short-circuit and
    //   hide later throws). If a guard throws, we propagate immediately
    //   and skip Wave 3 (mutations) — by design (block first, mutate later,
    //   never mutate-then-block).
    //
    //   `prometheusMdOnly` is BOTH BLOCKING (Wave 2) AND MUTATOR (Wave 3).
    //   It runs here for the BLOCKING behavior, then again in Wave 3 for
    //   the output.args.prompt prepend. The first invocation never mutates
    //   the throw path (throws on BLOCKED_TOOLS usage).
    const blockingResults = await Promise.allSettled([
      hooks.secretLeakGuard?.["tool.execute.before"]?.(input, output),
      hooks.envFileWriteGuard?.["tool.execute.before"]?.(input, output),
      hooks.writeExistingFileGuard?.["tool.execute.before"]?.(input, output),
      hooks.tasksTodowriteDisabler?.["tool.execute.before"]?.(input, output),
      hooks.prometheusMdOnly?.["tool.execute.before"]?.(input, output),
    ])
    for (const result of blockingResults) {
      if (result.status === "rejected") throw result.reason
    }

    // Wave 3 (5 hooks): MUTATOR — must run sequentially to preserve
    //   mutation order. Specifically:
    //   - 3 hooks CONCAT to output.args.prompt (prometheusMdOnly,
    //     sisyphusJuniorNotepad, atlasHook). Parallel writes would stomp
    //     each other (both read prompt from the same starting state).
    //   - nonInteractiveEnv REWRITES output.args.command (line 58) and
    //     REPLACES output.message; running it before other mutators is
    //     required so that downstream hooks see the rewritten command.
    //   - The order prometheusMdOnly -> sisyphusJuniorNotepad -> atlasHook
    //     is critical: atlasHook's prepended <system-reminder> must be
    //     the outermost (closest to the model), prometheusMdOnly's
    //     prepended PLANNING_CONSULT_WARNING the innermost (closest to the
    //     user prompt). Reversing the order would change semantics.
    await hooks.nonInteractiveEnv?.["tool.execute.before"]?.(input, output)
    await hooks.bashFileReadGuard?.["tool.execute.before"]?.(input, output)
    await hooks.questionLabelTruncator?.["tool.execute.before"]?.(input, output)
    await hooks.prometheusMdOnly?.["tool.execute.before"]?.(input, output)
    await hooks.sisyphusJuniorNotepad?.["tool.execute.before"]?.(input, output)
    await hooks.atlasHook?.["tool.execute.before"]?.(input, output)

    if (input.tool === "task") {
      const argsObject = output.args
      const category = typeof argsObject.category === "string" ? argsObject.category : undefined
      const subagentType = typeof argsObject.subagent_type === "string" ? argsObject.subagent_type : undefined
      const sessionId = typeof argsObject.session_id === "string" ? argsObject.session_id : undefined

      if (category) {
        argsObject.subagent_type = "mouse"
      } else if (!subagentType && sessionId) {
        const resolvedAgent = await resolveSessionAgent(ctx.client, sessionId)
        argsObject.subagent_type = resolvedAgent ?? "continue"
      }
    }

    if (hooks.matrixLoop && input.tool === "slashcommand") {
      const rawCommand = typeof output.args.command === "string" ? output.args.command : undefined
      const command = rawCommand?.replace(/^\//, "").toLowerCase()
      const sessionID = input.sessionID || getMainSessionID()

      if (command === "matrix-loop" && sessionID) {
        const rawArgs = rawCommand?.replace(/^\/?(matrix-loop)\s*/i, "") || ""
        const taskMatch = rawArgs.match(/^["'](.+?)["']/)
        const prompt =
          taskMatch?.[1] ||
          rawArgs.split(/\s+--/)[0]?.trim() ||
          "Complete the task as instructed"

        const maxIterMatch = rawArgs.match(/--max-iterations=(\d+)/i)
        const promiseMatch = rawArgs.match(/--completion-promise=["']?([^"'\s]+)["']?/i)

        hooks.matrixLoop.startLoop(sessionID, prompt, {
          maxIterations: maxIterMatch ? parseInt(maxIterMatch[1], 10) : undefined,
          completionPromise: promiseMatch?.[1],
        })
      } else if (command === "cancel-loop" && sessionID) {
        hooks.matrixLoop.cancelLoop(sessionID)
      } else if (command === "ulw-loop" && sessionID) {
        const rawArgs = rawCommand?.replace(/^\/?(ulw-loop)\s*/i, "") || ""
        const taskMatch = rawArgs.match(/^["'](.+?)["']/)
        const prompt =
          taskMatch?.[1] ||
          rawArgs.split(/\s+--/)[0]?.trim() ||
          "Complete the task as instructed"

        const maxIterMatch = rawArgs.match(/--max-iterations=(\d+)/i)
        const promiseMatch = rawArgs.match(/--completion-promise=["']?([^"'\s]+)["']?/i)

        hooks.matrixLoop.startLoop(sessionID, prompt, {
          ultrawork: true,
          maxIterations: maxIterMatch ? parseInt(maxIterMatch[1], 10) : undefined,
          completionPromise: promiseMatch?.[1],
        })
      }
    }

    if (input.tool === "slashcommand") {
      const rawCommand = typeof output.args.command === "string" ? output.args.command : undefined
      const command = rawCommand?.replace(/^\//, "").toLowerCase()
      const sessionID = input.sessionID || getMainSessionID()

      if (command === "stop-continuation" && sessionID) {
        hooks.stopContinuationGuard?.stop(sessionID)
        hooks.todoContinuationEnforcer?.cancelAllCountdowns()
        hooks.matrixLoop?.cancelLoop(sessionID)
        clearMissionState(ctx.directory)
        log("[stop-continuation] All continuation mechanisms stopped", {
          sessionID,
        })
      }
    }
  }
}
