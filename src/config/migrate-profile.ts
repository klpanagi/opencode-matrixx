import type { TierName } from "../shared/model-tiers"
import { expandProfile, PROFILE_NAMES, type ProfileName } from "./profiles"
import type { AgentOverrideConfig, CategoryConfig } from "./schema"
import type { MatrixxConfig } from "./schema/matrixx-config"

/**
 * Maps hardcoded model strings to tier names. Used by the migration helper
 * to convert vendor-specific profiles (e.g. `go`, `xiaomi-ultimate`) to the
 * new tier-based config format.
 */
const TIER_OVERRIDES: Record<string, TierName> = {
  "anthropic/claude-opus-4-6": "premium",
  "openai/gpt-5.3-codex": "premium",
  "opencode-go/kimi-k2.6": "premium",
  "opencode-go/deepseek-v4-pro": "premium",
  "opencode-go/glm-5.1": "premium",
  "opencode-go/minimax-m3": "premium",
  "xiaomi-token-plan-ams/mimo-v2.5-pro": "premium",
  "anthropic/claude-sonnet-4-6": "standard",
  "openai/gpt-5.2": "standard",
  "anthropic/claude-haiku-4-5": "fast",
  "openai/gpt-5-nano": "fast",
  "opencode-go/deepseek-v4-flash": "fast",
  "opencode-go/mimo-v2.5": "fast",
  "xiaomi-token-plan-ams/mimo-v2.5": "fast",
  "opencode/kimi-k2.5-free": "free",
  "xai/grok-code-fast-1": "free",
  "zai-coding-plan/glm-4.7": "free",
  "minimax-m2.5-free": "free",
}

export function modelToTier(model: string): TierName {
  if (model in TIER_OVERRIDES) {
    return TIER_OVERRIDES[model] as TierName
  }
  return "standard"
}

export function migrateAgentOverride(
  entry: AgentOverrideConfig | undefined,
): AgentOverrideConfig | undefined {
  if (!entry) return entry
  if (!entry.model) return entry
  const tier = modelToTier(entry.model)
  const { model: _drop, ...rest } = entry
  void _drop
  return { ...rest, tier }
}

export function migrateCategoryOverride(
  entry: CategoryConfig | undefined,
): CategoryConfig | undefined {
  if (!entry) return entry
  if (!entry.model) return entry
  const tier = modelToTier(entry.model)
  const { model: _drop, ...rest } = entry
  void _drop
  return { ...rest, tier }
}

export function migrateProfileToTiers(profile: ProfileName): Partial<MatrixxConfig> {
  if (!(PROFILE_NAMES as readonly string[]).includes(profile)) {
    throw new Error(`Unknown profile: ${profile}`)
  }
  const expanded = expandProfile(profile)
  const result: Partial<MatrixxConfig> = {}
  if (expanded.agents) {
    const agents: Record<string, AgentOverrideConfig | undefined> = {}
    for (const [name, entry] of Object.entries(expanded.agents)) {
      agents[name] = migrateAgentOverride(entry as AgentOverrideConfig)
    }
    result.agents = agents as MatrixxConfig["agents"]
  }
  if (expanded.categories) {
    const categories: Record<string, CategoryConfig | undefined> = {}
    for (const [name, entry] of Object.entries(expanded.categories)) {
      categories[name] = migrateCategoryOverride(entry as CategoryConfig)
    }
    result.categories = categories as MatrixxConfig["categories"]
  }
  return result
}
