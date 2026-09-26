import type { AvailableCategory, AvailableSkill } from "./agents/dynamic-agent-prompt-builder"
import type { MatrixxConfig } from "./config"
import type { BrowserAutomationProvider } from "./config/schema/browser-automation"
import type { Managers } from "./create-managers"
import type { BuiltinSkill } from "./features/builtin-skills"
import { createAvailableCategories } from "./plugin/available-categories"
import { createSkillContext } from "./plugin/skill-context"
import { createToolRegistry, registerV2Tools } from "./plugin/tool-registry"
import type { PluginContext, ToolsRecord, V2ToolsRecord } from "./plugin/types"
import { resolveTasksConfig } from "./shared/task-system-gating"
import { setPollTimeoutMs } from "./tools/delegate-task/timing"

type CreateToolsResult = {
  filteredTools: ToolsRecord
  v2Tools: V2ToolsRecord
  registerV2Tools: typeof registerV2Tools
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

  const pollTimeout = resolveTasksConfig(pluginConfig).pollTimeoutMs
  if (pollTimeout !== undefined) {
    setPollTimeoutMs(pollTimeout)
  }

  const skillContext = await createSkillContext({
    directory: ctx.directory,
    pluginConfig,
  })

  const availableCategories = createAvailableCategories(pluginConfig)

  const { filteredTools, v2Tools, taskSystemEnabled } = createToolRegistry({
    ctx,
    pluginConfig,
    managers,
    skillContext,
    availableCategories,
  })

  return {
    filteredTools,
    v2Tools,
    registerV2Tools,
    builtinSkills: skillContext.builtinSkills,
    availableSkills: skillContext.availableSkills,
    availableCategories,
    browserProvider: skillContext.browserProvider,
    disabledSkills: skillContext.disabledSkills,
    taskSystemEnabled,
  }
}
