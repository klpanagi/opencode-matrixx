import type { AvailableSkill } from "./agents/dynamic-agent-prompt-builder"
import type { HookName, MatrixxConfig } from "./config"
import type { BackgroundManager } from "./features/background-agent"
import type { BuiltinSkill } from "./features/builtin-skills"
import { createContinuationHooks } from "./plugin/hooks/create-continuation-hooks"

import { createCoreHooks } from "./plugin/hooks/create-core-hooks"
import { createSkillHooks } from "./plugin/hooks/create-skill-hooks"
import type { PluginContext } from "./plugin/types"

export type CreatedHooks = ReturnType<typeof createHooks>

export function createHooks(args: {
  ctx: PluginContext
  pluginConfig: MatrixxConfig
  backgroundManager: BackgroundManager
  isHookEnabled: (hookName: HookName) => boolean
  safeHookEnabled: boolean
  builtinSkills: BuiltinSkill[]
  availableSkills: AvailableSkill[]
}) {
  const {
    ctx,
    pluginConfig,
    backgroundManager,
    isHookEnabled,
    safeHookEnabled,
    builtinSkills,
    availableSkills,
  } = args

  const core = createCoreHooks({
    ctx,
    pluginConfig,
    isHookEnabled,
    safeHookEnabled,
  })

  const continuation = createContinuationHooks({
    ctx,
    pluginConfig,
    isHookEnabled,
    safeHookEnabled,
    backgroundManager,
    sessionRecovery: core.sessionRecovery,
  })

  const skill = createSkillHooks({
    ctx,
    isHookEnabled,
    safeHookEnabled,
    builtinSkills,
    availableSkills,
  })

  return {
    ...core,
    ...continuation,
    ...skill,
  }
}
