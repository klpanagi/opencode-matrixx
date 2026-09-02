import type { AgentConfig } from "@opencode-ai/sdk"
import type { BrowserAutomationProvider, CategoriesConfig, CategoryConfig } from "../config/schema"
import { createBuiltinSkills } from "../features/builtin-skills"
import { mergeCategories } from "../shared/merge-categories"
import type { AgentFactory } from "./types"

export type AgentSource = AgentFactory | AgentConfig

export function isFactory(source: AgentSource): source is AgentFactory {
  return typeof source === "function"
}

export function buildAgent(
  source: AgentSource,
  model: string,
  categories?: CategoriesConfig,
  browserProvider?: BrowserAutomationProvider,
  disabledSkills?: Set<string>
): AgentConfig {
  const base = isFactory(source) ? source(model) : { ...source }
  const categoryConfigs: Record<string, CategoryConfig> = mergeCategories(categories)

  const agentWithCategory = base as AgentConfig & { category?: string; skills?: string[]; variant?: string }
  if (agentWithCategory.category) {
    const categoryConfig = categoryConfigs[agentWithCategory.category]
    if (categoryConfig) {
      if (!base.model) {
        base.model = categoryConfig.model
      }
      if (base.temperature === undefined && categoryConfig.temperature !== undefined) {
        base.temperature = categoryConfig.temperature
      }
      if (base.variant === undefined && categoryConfig.variant !== undefined) {
        base.variant = categoryConfig.variant
      }
    }
  }

  if (agentWithCategory.skills?.length) {
    const builtinSkills = createBuiltinSkills({ browserProvider, disabledSkills })
    const resolved = builtinSkills.filter(s => agentWithCategory.skills?.includes(s.name))
    if (resolved.length > 0) {
      const skillContent = resolved.map(s => s.template).join("\n\n")
      base.prompt = skillContent + (base.prompt ? `\n\n${base.prompt}` : "")
    }
  }

  return base
}
