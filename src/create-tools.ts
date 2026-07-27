import type { AvailableCategory, AvailableSkill } from "./agents/dynamic-agent-prompt-builder"
import type { MatrixxConfig } from "./config"
import type { BrowserAutomationProvider } from "./config/schema/browser-automation"
import type { Managers } from "./create-managers"
import type { BuiltinSkill } from "./features/builtin-skills"
import { createAvailableCategories } from "./plugin/available-categories"
import { createSkillContext } from "./plugin/skill-context"
import { createToolRegistry } from "./plugin/tool-registry"
import type { PluginContext, ToolsRecord } from "./plugin/types"

type CreateToolsResult = {
  filteredTools: ToolsRecord
  builtinSkills: BuiltinSkill[]
  availableSkills: AvailableSkill[]
  availableCategories: AvailableCategory[]
  browserProvider: BrowserAutomationProvider
  disabledSkills: Set<string>
  taskSystemEnabled: boolean
}

export async function createTools(args: {
  ctx: PluginContext
  pluginConfig: MatrixxConfig
  managers: Pick<Managers, "backgroundManager" | "tmuxSessionManager">
}): Promise<CreateToolsResult> {
  const { ctx, pluginConfig, managers } = args

  const skillContext = await createSkillContext({
    directory: ctx.directory,
    pluginConfig,
  })

  const availableCategories = createAvailableCategories(pluginConfig)

  const { filteredTools, taskSystemEnabled } = createToolRegistry({
    ctx,
    pluginConfig,
    managers,
    skillContext,
    availableCategories,
  })

  return {
    filteredTools,
    builtinSkills: skillContext.builtinSkills,
    availableSkills: skillContext.availableSkills,
    availableCategories,
    browserProvider: skillContext.browserProvider,
    disabledSkills: skillContext.disabledSkills,
    taskSystemEnabled,
  }
}
