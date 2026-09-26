import type { MatrixxConfig } from "./config"
import { V1_HOOK_KEYS } from "./config/schema/hooks-v1-keys"
import type { CreatedHooks } from "./create-hooks"
import type { Managers } from "./create-managers"
import { createChatMessageHandler } from "./plugin/chat-message"
import { createChatParamsHandler } from "./plugin/chat-params"
import { createEventHandler } from "./plugin/event"
import { createMessagesTransformHandler } from "./plugin/messages-transform"
import { createToolDefinitionHandler } from "./plugin/tool-definition"
import { createToolExecuteAfterHandler } from "./plugin/tool-execute-after"
import { createToolExecuteBeforeHandler } from "./plugin/tool-execute-before"
import type { PluginContext, PluginInterface, ToolsRecord } from "./plugin/types"

export function createPluginInterface(args: {
  ctx: PluginContext
  pluginConfig: MatrixxConfig
  firstMessageVariantGate: {
    shouldOverride: (sessionID: string) => boolean
    markApplied: (sessionID: string) => void
    markSessionCreated: (sessionInfo: { id?: string; title?: string; parentID?: string } | undefined) => void
    clear: (sessionID: string) => void
  }
  managers: Managers
  hooks: CreatedHooks
  tools: ToolsRecord
}): PluginInterface {
  const { ctx, pluginConfig, firstMessageVariantGate, managers, hooks, tools } =
    args

  return {
    tool: tools,

    "chat.params": createChatParamsHandler({ anthropicEffort: hooks.anthropicEffort }),

    "chat.message": createChatMessageHandler({
      ctx,
      pluginConfig,
      firstMessageVariantGate,
      hooks,
    }),

    [V1_HOOK_KEYS.messagesTransform]: createMessagesTransformHandler({
      hooks,
    }),

    config: managers.configHandler,

    event: createEventHandler({
      ctx,
      pluginConfig,
      firstMessageVariantGate,
      managers,
      hooks,
    }),

    [V1_HOOK_KEYS.toolExecuteBefore]: createToolExecuteBeforeHandler({
      ctx,
      hooks,
    }),

    [V1_HOOK_KEYS.toolExecuteAfter]: createToolExecuteAfterHandler({
      hooks,
    }),

    "tool.definition": createToolDefinitionHandler({
      hooks,
    }),
  }
}
