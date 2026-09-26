import { V1_HOOK_KEYS } from "../../config/schema/hooks-v1-keys"
import type { CreatedHooks } from "../../create-hooks"
import { createCompactionHandler } from "../compaction"
import type { PluginInterface } from "../types"
import type { V2HookDeps } from "./register-hooks"

type WidenedHandlerField =
  | "toolExecuteBefore"
  | "toolExecuteAfter"
  | "chatMessage"
  | "messagesTransform"
  | "event"

type WidenedHandler<K extends WidenedHandlerField> = NonNullable<V2HookDeps[K]>

/**
 * `createPluginInterface` re-types each handler to the narrower signature
 * declared on V1 `Hooks`, but the factories behind it were written against the
 * wider shapes the V2 adapters produce — V1 types the after-hook output as
 * always-present while the V2 after-hook is optional, and V1 types the
 * chat-message output as a `UserMessage` while the V2 prompt hook hands over a
 * mutable object. Both paths carry the same runtime value, so each handler is
 * re-widened once here rather than at every call site.
 */
function widen<K extends WidenedHandlerField>(handler: unknown): WidenedHandler<K> {
  return handler as WidenedHandler<K>
}

export function toV2HookDeps(args: {
  pluginInterface: PluginInterface
  hooks: CreatedHooks
}): V2HookDeps {
  const { pluginInterface, hooks } = args

  return {
    toolExecuteBefore: widen<"toolExecuteBefore">(pluginInterface[V1_HOOK_KEYS.toolExecuteBefore]),
    toolExecuteAfter: widen<"toolExecuteAfter">(pluginInterface[V1_HOOK_KEYS.toolExecuteAfter]),
    chatMessage: widen<"chatMessage">(pluginInterface[V1_HOOK_KEYS.chatMessage]),
    messagesTransform: widen<"messagesTransform">(pluginInterface[V1_HOOK_KEYS.messagesTransform]),
    event: widen<"event">(pluginInterface.event),
    sessionCompacting: createCompactionHandler({ hooks }),
  }
}
