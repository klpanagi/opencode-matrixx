import type { CategoriesConfig, CategoryConfig, ModelPresetEntry, ModelRequirements } from "../../config/schema"
import { log } from "../../shared/logger"
import { isModelAvailable } from "../../shared/model-availability"
import { getCategoryModelRequirements } from "../../shared/model-requirements"
import { normalizeModel } from "../../shared/model-resolution-pipeline"
import { CATEGORY_PROMPT_APPENDS, DEFAULT_CATEGORIES } from "./constants"

interface ResolveCategoryConfigOptions {
  userCategories?: CategoriesConfig
  inheritedModel?: string
  systemDefaultModel?: string
  availableModels?: Set<string>
  modelRequirements?: ModelRequirements
  /** Preset entry resolved at call time (session overlay > config active_preset). */
  presetEntry?: ModelPresetEntry
}

interface ResolveCategoryConfigResult {
  config: CategoryConfig
  promptAppend: string
  model: string | undefined
  temperature: number | undefined
}

/**
 * Resolve the configuration for a given category name.
 * Merges default and user configurations, handles model resolution.
 */
export function resolveCategoryConfig(
  categoryName: string,
  options: ResolveCategoryConfigOptions
): ResolveCategoryConfigResult | null {
  const { userCategories, inheritedModel: _inheritedModel, systemDefaultModel, availableModels, modelRequirements, presetEntry } = options

  const defaultConfig = DEFAULT_CATEGORIES[categoryName]
  const userConfig = userCategories?.[categoryName]
  const hasExplicitUserConfig = userConfig !== undefined

  if (userConfig?.disable) {
    return null
  }

  const categoryRequirements = getCategoryModelRequirements(modelRequirements ? { modelRequirements } : undefined)
  const categoryReq = categoryRequirements[categoryName]
  if (categoryReq?.requiresModel && availableModels && !hasExplicitUserConfig) {
    if (!isModelAvailable(categoryReq.requiresModel, availableModels)) {
      log(`[resolveCategoryConfig] Category ${categoryName} requires ${categoryReq.requiresModel} but not available`)
      return null
    }
  }
  const defaultPromptAppend = CATEGORY_PROMPT_APPENDS[categoryName] ?? ""

  if (!defaultConfig && !userConfig) {
    return null
  }

  // Model priority for categories: user override > preset entry > category default > system default
  // Categories have explicit models - no inheritance from parent session
  const model =
    normalizeModel(userConfig?.model) ??
    normalizeModel(presetEntry?.model) ??
    normalizeModel(defaultConfig?.model) ??
    systemDefaultModel
  const hasUserModelOverride = (userConfig?.model ?? presetEntry?.model) !== undefined
  const config: CategoryConfig = {
    ...defaultConfig,
    ...userConfig,
    model,
    variant: userConfig?.variant ?? presetEntry?.variant ?? (hasUserModelOverride ? undefined : defaultConfig?.variant),
  }

  let promptAppend = defaultPromptAppend
  if (userConfig?.prompt_append) {
    promptAppend = defaultPromptAppend
      ? `${defaultPromptAppend}\n\n${userConfig.prompt_append}`
      : userConfig.prompt_append
  }

  return { config, promptAppend, model, temperature: config.temperature }
}
