import { V1_HOOK_KEYS } from "../config/schema/hooks-v1-keys"
import type { CreatedHooks } from "../create-hooks"

export type CompactionInput = { sessionID: string }
export type CompactionOutput = { context: string[] }

type CompactionHooks = Pick<
  CreatedHooks,
  "compactionTodoPreserver" | "compactionContextInjector" | "planPersister" | "evolutionCompressor"
>

/**
 * Shared by the V1 compacting hook and the V2 `session.hook("compaction")`
 * adapter, so both runtimes perform the identical capture + rehydration work.
 */
export function createCompactionHandler(args: {
  hooks: CompactionHooks
}): (input: CompactionInput, output: CompactionOutput) => Promise<void> {
  const { hooks } = args

  return async (input, output): Promise<void> => {
    await hooks.compactionTodoPreserver?.capture(input.sessionID)
    if (hooks.compactionContextInjector) {
      output.context.push(hooks.compactionContextInjector(input.sessionID))
    }

    if (hooks.planPersister) {
      const planContext = hooks.planPersister.buildRehydrationContext(input.sessionID)
      if (planContext) {
        output.context.push(planContext)
      }
    }

    await hooks.evolutionCompressor?.[V1_HOOK_KEYS.sessionCompacting]?.(input, output)
  }
}
