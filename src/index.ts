import { Plugin } from "@opencode/plugin"
import type { Plugin as V1Plugin } from "@opencode-ai/plugin"

import type { HookName } from "./config"
import { V1_HOOK_KEYS } from "./config/schema/hooks-v1-keys"

import { createHooks } from "./create-hooks"
import { createManagers } from "./create-managers"
import { createTools } from "./create-tools"
import { createCompactionHandler } from "./plugin/compaction"
import { createV1ContextFromV2 } from "./plugin/v2/context-adapter"
import { toV2HookDeps } from "./plugin/v2/hook-deps"
import {
  collectAgentPermissions,
  createPermissionEvaluateHandler,
  createSentinelPolicyRules,
} from "./plugin/v2/permission-policy"
import { registerV2Components } from "./plugin/v2/register-components"
import { registerV2Hooks } from "./plugin/v2/register-hooks"
import { loadPluginConfig } from "./plugin-config"
import { setAvailableToolNames } from "./plugin-handlers/agent-config-handler"
import { createPluginInterface } from "./plugin-interface"
import { createModelCacheState } from "./plugin-state"
import { injectServerAuthIntoClient, log } from "./shared"
import { setContextModeForPrompts } from "./shared/context-mode-enforcement"
import { switchProfile } from "./shared/dcp-switch-profile"
import { createFirstMessageVariantGate } from "./shared/first-message-variant"
import { startTmuxCheck } from "./tools"

const v1Plugin: V1Plugin = async (ctx) => {
  log("[MatrixxPlugin] ENTRY - plugin loading", {
    directory: ctx.directory,
  })

  injectServerAuthIntoClient(ctx.client)
  startTmuxCheck()

const pluginConfig = await loadPluginConfig(ctx.directory, ctx)
  setContextModeForPrompts(pluginConfig.context_mode)

  // Auto-activate DCP profile on startup if default_profile is configured
  if (pluginConfig.dcp?.default_profile) {
    switchProfile(pluginConfig.dcp.default_profile, { pluginConfig })
  }

  const disabledHooks = new Set(pluginConfig.disabled_hooks ?? [])

  const isHookEnabled = (hookName: HookName): boolean => !disabledHooks.has(hookName)
  const safeHookEnabled = pluginConfig.experimental?.safe_hook_creation ?? true

  const firstMessageVariantGate = createFirstMessageVariantGate()

  const tmuxConfig = {
    enabled: pluginConfig.tmux?.enabled ?? false,
    layout: pluginConfig.tmux?.layout ?? "main-vertical",
    main_pane_size: pluginConfig.tmux?.main_pane_size ?? 60,
    main_pane_min_width: pluginConfig.tmux?.main_pane_min_width ?? 120,
    agent_pane_min_width: pluginConfig.tmux?.agent_pane_min_width ?? 40,
  }

  const modelCacheState = createModelCacheState()

  const managers = createManagers({
    ctx,
    pluginConfig,
    tmuxConfig,
    modelCacheState,
    backgroundNotificationHookEnabled: isHookEnabled("background-notification"),
  })

  const toolsResult = await createTools({
    ctx,
    pluginConfig,
    managers,
  })

  // Store tool names for use when building agent prompts
  const toolNames = Object.keys(toolsResult.filteredTools)
  setAvailableToolNames(toolNames)

  const hooks = createHooks({
    ctx,
    pluginConfig,
    backgroundManager: managers.backgroundManager,
    isHookEnabled,
    safeHookEnabled,
    builtinSkills: toolsResult.builtinSkills,
    availableSkills: toolsResult.availableSkills,
  })

  const pluginInterface = createPluginInterface({
    ctx,
    pluginConfig,
    firstMessageVariantGate,
    managers,
    hooks,
    tools: toolsResult.filteredTools,
  })

  const compacting = createCompactionHandler({ hooks })

  return {
    ...pluginInterface,

    [V1_HOOK_KEYS.sessionCompacting]: compacting,
  }
}

const v2Plugin = Plugin.define({
  id: "matrixx",
  setup: async (ctx) => {
    // The hook tiers are written against the V1 context, which carries the SDK
    // client. V2 supplies no client, so one is derived from `ctx.location` and
    // pointed at the same server; otherwise `client.session.messages`,
    // `client.tui.showToast` and the rest would be unreachable on V2.
    const { ctx: v1Ctx, serverUrlSource } = await createV1ContextFromV2(ctx)
    log("[MatrixxPlugin] V2 setup resolved the V1 context", {
      directory: v1Ctx.directory,
      serverUrl: v1Ctx.serverUrl.toString(),
      serverUrlSource,
    })

    startTmuxCheck()

    const pluginConfig = await loadPluginConfig(v1Ctx.directory, v1Ctx)
    setContextModeForPrompts(pluginConfig.context_mode)

    if (pluginConfig.dcp?.default_profile) {
      switchProfile(pluginConfig.dcp.default_profile, { pluginConfig })
    }

    const disabledHooks = new Set(pluginConfig.disabled_hooks ?? [])
    const isHookEnabled = (hookName: HookName): boolean => !disabledHooks.has(hookName)
    const safeHookEnabled = pluginConfig.experimental?.safe_hook_creation ?? true

    const firstMessageVariantGate = createFirstMessageVariantGate()

    const tmuxConfig = {
      enabled: pluginConfig.tmux?.enabled ?? false,
      layout: pluginConfig.tmux?.layout ?? "main-vertical",
      main_pane_size: pluginConfig.tmux?.main_pane_size ?? 60,
      main_pane_min_width: pluginConfig.tmux?.main_pane_min_width ?? 120,
      agent_pane_min_width: pluginConfig.tmux?.agent_pane_min_width ?? 40,
    }

    const managers = createManagers({
      ctx: v1Ctx,
      pluginConfig,
      tmuxConfig,
      modelCacheState: createModelCacheState(),
      backgroundNotificationHookEnabled: isHookEnabled("background-notification"),
    })

    const toolsResult = await createTools({ ctx: v1Ctx, pluginConfig, managers })
    setAvailableToolNames(Object.keys(toolsResult.filteredTools))

    const hooks = createHooks({
      ctx: v1Ctx,
      pluginConfig,
      backgroundManager: managers.backgroundManager,
      isHookEnabled,
      safeHookEnabled,
      builtinSkills: toolsResult.builtinSkills,
      availableSkills: toolsResult.availableSkills,
    })

    const pluginInterface = createPluginInterface({
      ctx: v1Ctx,
      pluginConfig,
      firstMessageVariantGate,
      managers,
      hooks,
      tools: toolsResult.filteredTools,
    })

    const disposeTools = await toolsResult.registerV2Tools(ctx, toolsResult.v2Tools)
    const disposeHooks = await registerV2Hooks(ctx, {
      ...toV2HookDeps({ pluginInterface, hooks }),
      permissionEvaluate: createPermissionEvaluateHandler({
        policies: pluginConfig.experimental?.policies,
        agentPermissions: collectAgentPermissions(pluginConfig.agents),
        agentRules: createSentinelPolicyRules(),
      }),
    })
    const disposeComponents = await registerV2Components(ctx, {
      directory: v1Ctx.directory,
      pluginConfig,
      availableToolNames: Object.keys(toolsResult.filteredTools),
    })

    return async () => {
      await disposeComponents()
      await disposeHooks()
      await disposeTools.dispose()
    }
  },
})

const MatrixxPlugin = Object.assign(v1Plugin, v2Plugin)

export default MatrixxPlugin

export type {
  AgentName,
  AgentOverrideConfig,
  AgentOverrides,
  BuiltinCommandName,
  HookName,
  MatrixxConfig,
  McpName,
} from "./config"

// NOTE: Do NOT export functions from main index.ts!
// OpenCode treats ALL exports as plugin instances and calls them.
// Config error utilities are available via "./shared/config-errors" for internal use only.
export type { ConfigLoadError } from "./shared/config-errors"
