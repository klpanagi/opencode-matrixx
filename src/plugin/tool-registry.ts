import type { ToolDefinition } from "@opencode-ai/plugin"

import type {
  AvailableCategory,
} from "../agents/dynamic-agent-prompt-builder"
import type { MatrixxConfig } from "../config"
import type { Managers } from "../create-managers"
import { log } from "../shared"
import { filterDisabledTools } from "../shared/disabled-tools"
import { isTaskSystemEnabled } from "../shared/task-system-gating"
import {
  builtinTools,
  createAssemblyTool,
  createAstGrepTools,
  createBackgroundTools,
  createBddCreateContractTool,
  createBddParseGherkinTool,
  createBddPipelineTool,
  createBddValidateContractTool,
  createDelegateTask,
  createGithubSearchTools,
  createGlobTools,
  createGrepTools,
  createHandoffTools,
  createHashlineEditTool,
  createKnowledgeHubConfirmTool,
  createLookAt,
  createPdfExtractFiguresTool,
  createPlanCreateTool,
  createPlanDeleteTool,
  createPlanListTool,
  createPlanReadTool,
  createPlanUpdateTool,
  createPresetTool,
  createSessionManagerTools,
  createSkillTool,
  createSlashcommandTool,
  createTaskCleanupTool,
  createTaskCreateTool,
  createTaskGetTool,
  createTaskList,
  createTaskUpdateTool,
  discoverCommandsSync,
  interactive_bash,
} from "../tools"
import type { SkillContext } from "./skill-context"
import {
  isConstructAgentEnabled,
  shouldEnableBddTools,
  shouldEnableKnowledgeHubConfirm,
  shouldEnableLookAt,
  shouldEnablePdfFigures,
  shouldEnablePresetTools,
} from "./tool-gating"
import type { PluginContext, ToolsRecord } from "./types"

export type ToolRegistryResult = {
  filteredTools: ToolsRecord
  taskSystemEnabled: boolean
}

export function createToolRegistry(args: {
  ctx: PluginContext
  pluginConfig: MatrixxConfig
  managers: Pick<Managers, "backgroundManager" | "tmuxSessionManager">
  skillContext: SkillContext
  availableCategories: AvailableCategory[]
}): ToolRegistryResult {
  const { ctx, pluginConfig, managers, skillContext, availableCategories } = args

  const backgroundTools = createBackgroundTools(managers.backgroundManager, ctx.client, ctx.directory)

  const isMultimodalLookerEnabled = isConstructAgentEnabled(pluginConfig.disabled_agents)
  const toolGating = pluginConfig.tool_gating
  const bddEnabled = shouldEnableBddTools(ctx.directory, toolGating?.bdd_tools)
  const pdfFiguresEnabled = shouldEnablePdfFigures(ctx.directory, toolGating?.pdf_figures)
  const lookAtEnabled = shouldEnableLookAt(ctx.directory, isMultimodalLookerEnabled, toolGating?.look_at)
  const knowledgeHubConfirmEnabled = shouldEnableKnowledgeHubConfirm(pluginConfig.knowledge?.hubs)
  const presetToolsEnabled = shouldEnablePresetTools(toolGating?.preset_tools)
  const lookAt = lookAtEnabled ? createLookAt(ctx) : null
  const bddToolsRecord: Record<string, ToolDefinition> = bddEnabled
    ? {
        bdd_create_contract: createBddCreateContractTool(),
        bdd_parse_gherkin: createBddParseGherkinTool(),
        bdd_pipeline_run: createBddPipelineTool({ manager: managers.backgroundManager }),
        bdd_validate_contract: createBddValidateContractTool(),
      }
    : {}
  const pdfFiguresRecord: Record<string, ToolDefinition> = pdfFiguresEnabled
    ? { ...createPdfExtractFiguresTool() }
    : {}
  const presetRecord: Record<string, ToolDefinition> = presetToolsEnabled
    ? { ...createPresetTool({ pluginConfig, directory: ctx.directory }) }
    : {}

  const delegateTask = createDelegateTask({
    manager: managers.backgroundManager,
    client: ctx.client,
    directory: ctx.directory,
    userCategories: pluginConfig.categories,
    globalModel: pluginConfig.global_model,
    mouseModel: pluginConfig.agents?.mouse?.model,
    browserProvider: skillContext.browserProvider,
    disabledSkills: skillContext.disabledSkills,
    availableCategories,
    availableSkills: skillContext.availableSkills,
    modelRequirements: pluginConfig.modelRequirements,
    complexityDowngrades: pluginConfig.complexityDowngrades,
    modelPresets: pluginConfig.model_presets,
    activePreset: pluginConfig.active_preset,
    agentOverrides: pluginConfig.agents,
    onSyncSessionCreated: async (event) => {
      log("[index] onSyncSessionCreated callback", {
        sessionID: event.sessionID,
        parentID: event.parentID,
        title: event.title,
      })
      await managers.tmuxSessionManager.onSessionCreated({
        type: "session.created",
        properties: {
          info: {
            id: event.sessionID,
            parentID: event.parentID,
            title: event.title,
          },
        },
      })
    },
  })

  const skillTool = createSkillTool({
    skills: skillContext.builtinSkills,
    disabledSkills: skillContext.disabledSkills,
  })

  const commands = discoverCommandsSync(ctx.directory)
  const slashcommandTool = createSlashcommandTool({
    commands,
    skills: skillContext.builtinSkills,
    client: ctx.client,
  })

  const taskSystemEnabled = isTaskSystemEnabled(pluginConfig)
  const taskToolsRecord: Record<string, ToolDefinition> = taskSystemEnabled
    ? {
        task_create: createTaskCreateTool(pluginConfig, ctx),
        task_get: createTaskGetTool(pluginConfig, ctx),
        task_list: createTaskList(pluginConfig, ctx),
        task_update: createTaskUpdateTool(pluginConfig, ctx),
        task_cleanup: createTaskCleanupTool(pluginConfig, ctx),
      }
    : {}
  const hashlineEnabled = pluginConfig.experimental?.hashline_edit ?? false
  const hashlineToolsRecord: Record<string, ToolDefinition> = hashlineEnabled
    ? { edit: createHashlineEditTool(ctx) }
    : {}

  const planToolsRecord: Record<string, ToolDefinition> = {
    plan_create: createPlanCreateTool(ctx),
    plan_read: createPlanReadTool(ctx),
    plan_list: createPlanListTool(ctx),
    plan_update: createPlanUpdateTool(ctx),
    plan_delete: createPlanDeleteTool(ctx),
  }

  const assemblyEnabled = pluginConfig.assembly?.enabled !== false
  const assemblyTool = assemblyEnabled
    ? createAssemblyTool({
        manager: managers.backgroundManager,
        pluginConfig,
      })
    : null

  const allTools: Record<string, ToolDefinition> = {
    ...builtinTools,
    ...createGrepTools(ctx),
    ...createGithubSearchTools(ctx),
    ...createGlobTools(ctx),
    ...createAstGrepTools(ctx),
    ...createSessionManagerTools(ctx),
    ...createHandoffTools(ctx),
    ...(knowledgeHubConfirmEnabled ? { knowledge_hub_confirm: createKnowledgeHubConfirmTool(ctx) } : {}),
    ...pdfFiguresRecord,
    ...presetRecord,
    ...backgroundTools,
    ...(lookAt ? { look_at: lookAt } : {}),
    task: delegateTask,
    skill: skillTool,
    slashcommand: slashcommandTool,
    interactive_bash,
    ...taskToolsRecord,
    ...hashlineToolsRecord,
    ...planToolsRecord,
    ...(assemblyTool ? { assembly: assemblyTool } : {}),
    ...bddToolsRecord,
  }

  const filteredTools = filterDisabledTools(allTools, pluginConfig.disabled_tools)

  return {
    filteredTools,
    taskSystemEnabled,
  }
}
