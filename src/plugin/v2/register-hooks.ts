import { log } from "../../shared"
import {
  type ChatMessageHandler,
  type CompactionHandler,
  type EventHandler,
  type MessagesTransformHandler,
  runCompactionCall,
  type ToolExecuteAfterHandler,
  type ToolExecuteBeforeHandler,
  toChatMessageCall,
  toEventCall,
  toMessagesTransformCall,
  toToolAfterCall,
  toToolBeforeCall,
} from "./adapters"
import { createV2GuardChain, type V2ToolGuardHandlers } from "./guard-chain"
import type { PermissionEvaluateHandler } from "./permission-guards"
import type {
  V2CompactionInput,
  V2ContextInput,
  V2EventItem,
  V2HookRegistrar,
  V2HookRegistration,
  V2PermissionEvaluation,
  V2PromptInput,
  V2ToolAfterInput,
  V2ToolBeforeInput,
} from "./v2-hook-types"

export type V2HookDeps = {
  toolExecuteBefore?: ToolExecuteBeforeHandler
  toolExecuteAfter?: ToolExecuteAfterHandler
  chatMessage?: ChatMessageHandler
  messagesTransform?: MessagesTransformHandler
  sessionCompacting?: CompactionHandler
  event?: EventHandler
  /** Guards, keyed by their `CreatedHooks` property. Mutually exclusive with `toolExecuteBefore`. */
  toolGuards?: V2ToolGuardHandlers
  permissionEvaluate?: PermissionEvaluateHandler
}

export type V2HookCleanup = () => Promise<void>

/**
 * Registers the Matrixx hook surface on the V2 runtime and returns a Cleanup
 * that disposes every Registration. Each callback translates the V2 hook input
 * into the shape the existing V1 handler expects, so the ~80 hook
 * implementations stay untouched.
 */
export async function registerV2Hooks(
  ctx: V2HookRegistrar,
  deps: V2HookDeps
): Promise<V2HookCleanup> {
  const registrations: V2HookRegistration[] = []

  const beforeHandler = deps.toolGuards
    ? createV2GuardChain(deps.toolGuards)
    : deps.toolExecuteBefore

  registrations.push(
    await ctx.tool.hook("execute.before", async (input) => {
      const call = toToolBeforeCall(input as V2ToolBeforeInput)
      await beforeHandler?.(call.input, call.output)
    })
  )

  registrations.push(
    await ctx.tool.hook("execute.after", async (input) => {
      const call = toToolAfterCall(input as V2ToolAfterInput)
      await deps.toolExecuteAfter?.(call.input, call.output)
    })
  )

  registrations.push(
    await ctx.session.hook("prompt", async (input) => {
      const call = toChatMessageCall(input as V2PromptInput)
      await deps.chatMessage?.(call.input, call.output)
    })
  )

  registrations.push(
    await ctx.session.hook("context", async (input) => {
      const call = toMessagesTransformCall(input as V2ContextInput)
      await deps.messagesTransform?.(call.input, call.output)
    })
  )

  registrations.push(
    await ctx.session.hook("compaction", async (input) => {
      await runCompactionCall(input as V2CompactionInput, deps.sessionCompacting)
    })
  )

  consumeEvents(ctx, deps.event)

  if (deps.permissionEvaluate) {
    registrations.push(
      await ctx.permission.hook("evaluate", async (input) => {
        await deps.permissionEvaluate?.(input as V2PermissionEvaluation)
      })
    )
  }

  return async () => {
    for (const registration of registrations.reverse()) {
      await registration.dispose()
    }
  }
}

/**
 * `ctx.event.subscribe()` returns an AsyncIterable, NOT a Registration, so it
 * cannot be disposed. The loop is therefore left running for the plugin
 * lifetime and terminates when the iterator ends or the handler throws.
 */
function consumeEvents(ctx: V2HookRegistrar, handler: EventHandler | undefined): void {
  const stream = ctx.event.subscribe()
  void (async () => {
    try {
      for await (const event of stream as AsyncIterable<V2EventItem>) {
        await handler?.(toEventCall(event))
      }
    } catch (error) {
      log("[registerV2Hooks] event stream ended with an error", { error })
    }
  })()
}
