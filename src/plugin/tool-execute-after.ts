import { V1_HOOK_KEYS } from "../config/schema/hooks-v1-keys"
import type { CreatedHooks } from "../create-hooks"
import { consumeToolMetadata } from "../features/tool-metadata-store"

export function createToolExecuteAfterHandler(args: {
  hooks: CreatedHooks
}): (
  input: { tool: string; sessionID: string; callID: string },
  output:
    | { title: string; output: string; metadata: Record<string, unknown> }
    | undefined,
) => Promise<void> {
  const { hooks } = args

  return async (
    input: { tool: string; sessionID: string; callID: string },
    output: { title: string; output: string; metadata: Record<string, unknown> } | undefined,
  ): Promise<void> => {
    if (!output) return

    const stored = consumeToolMetadata(input.sessionID, input.callID)
    if (stored) {
      if (stored.title) {
        output.title = stored.title
      }
      if (stored.metadata) {
        output.metadata = { ...output.metadata, ...stored.metadata }
      }
    }

    await hooks.toolOutputTruncator?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)

    // Run preemptiveCompaction in parallel with remaining hooks — it has a 60s timeout
    // on session.summarize() and should not block the other 16 hooks in the chain.
    // Total time: max(prepaction, remaining) instead of preemption + remaining.
    const remainingHooks = async () => {
      await hooks.webfetchRedirectGuard?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.evolutionWatcher?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.contextWindowMonitor?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.commentChecker?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.directoryAgentsInjector?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.rulesInjector?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.emptyTaskResponseDetector?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.agentUsageReminder?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.categorySkillReminder?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.interactiveBashSession?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.editErrorRecovery?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.delegateTaskRetry?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.architectHook?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.taskResumeInfo?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.hashlineReadEnhancer?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.jsonErrorRecovery?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.readImageResizer?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
      await hooks.taskNotepad?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output)
    }

    await Promise.all([
      hooks.preemptiveCompaction?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output),
      hooks.qualityGate?.[V1_HOOK_KEYS.toolExecuteAfter]?.(input, output),
      remainingHooks(),
    ])
  }
}
