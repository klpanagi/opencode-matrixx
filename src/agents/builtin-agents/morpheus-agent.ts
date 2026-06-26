import type { AgentConfig } from "@opencode-ai/sdk"
import type { CategoriesConfig, CategoryConfig } from "../../config/schema"
import { AGENT_MODEL_REQUIREMENTS, isAnyFallbackModelAvailable } from "../../shared"
import type { AvailableAgent, AvailableCategory, AvailableSkill } from "../dynamic-agent-prompt-builder"
import { createMorpheusAgent } from "../morpheus"
import type { AgentOverrides } from "../types"
import { applyOverrides } from "./agent-overrides"
import { applyEnvironmentContext } from "./environment-context"
import { applyModelResolution, getFirstFallbackModel } from "./model-resolution"

export function maybeCreateMorpheusConfig(input: {
  disabledAgents: string[]
  agentOverrides: AgentOverrides
  uiSelectedModel?: string
  availableModels: Set<string>
  systemDefaultModel?: string
  isFirstRunNoCache: boolean
  availableAgents: AvailableAgent[]
  availableSkills: AvailableSkill[]
  availableCategories: AvailableCategory[]
  mergedCategories: Record<string, CategoryConfig>
  directory?: string
  userCategories?: CategoriesConfig
  useTaskSystem: boolean
}): AgentConfig | undefined {
  const {
    disabledAgents,
    agentOverrides,
    uiSelectedModel,
    availableModels,
    systemDefaultModel,
    isFirstRunNoCache,
    availableAgents,
    availableSkills,
    availableCategories,
    mergedCategories,
    directory,
    useTaskSystem,
  } = input

  const morpheusOverride = agentOverrides.morpheus
  const morpheusRequirement = AGENT_MODEL_REQUIREMENTS.morpheus
  const hasMorpheusExplicitConfig = morpheusOverride !== undefined
  const meetsMorpheusAnyModelRequirement =
    !morpheusRequirement?.requiresAnyModel ||
    hasMorpheusExplicitConfig ||
    isFirstRunNoCache ||
    isAnyFallbackModelAvailable(morpheusRequirement.fallbackChain, availableModels)

  if (disabledAgents.includes("morpheus") || !meetsMorpheusAnyModelRequirement) return undefined

  let morpheusResolution = applyModelResolution({
    uiSelectedModel: morpheusOverride?.model ? undefined : uiSelectedModel,
    userModel: morpheusOverride?.model,
    requirement: morpheusRequirement,
    availableModels,
    systemDefaultModel,
  })

  if (isFirstRunNoCache && !morpheusOverride?.model && !uiSelectedModel) {
    morpheusResolution = getFirstFallbackModel(morpheusRequirement)
  }

  if (!morpheusResolution) return undefined
  const { model: morpheusModel, variant: morpheusResolvedVariant } = morpheusResolution

  let morpheusConfig = createMorpheusAgent(
    morpheusModel,
    availableAgents,
    undefined,
    availableSkills,
    availableCategories,
    useTaskSystem
  )

  if (morpheusResolvedVariant) {
    morpheusConfig = { ...morpheusConfig, variant: morpheusResolvedVariant }
  }

  morpheusConfig = applyOverrides(morpheusConfig, morpheusOverride, mergedCategories)
  morpheusConfig = applyEnvironmentContext(morpheusConfig, directory)

  return morpheusConfig
}
