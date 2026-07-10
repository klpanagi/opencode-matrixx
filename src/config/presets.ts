import type { MatrixxConfig } from "./schema/matrixx-config"

export const PRESET_NAMES = ["minimal", "balanced", "performance", "frontier"] as const
export type PresetName = (typeof PRESET_NAMES)[number]

/**
 * Presets are thin wrappers over the tier system. They never hardcode model
 * strings — every model selection goes through `tier` which is resolved at
 * config-load time against the live provider list. Adding a new model on
 * OpenCode's side requires zero changes here.
 */
const PRESETS: Record<PresetName, MatrixxConfig> = {
  minimal: {
    default_tier: "fast",
    agents: {
      trinity: { tier: "free" },
      operator: { tier: "free" },
    },
  } as MatrixxConfig,

  balanced: {
    default_tier: "standard",
    agents: {
      morpheus: { tier: "premium" },
      oracle: { tier: "premium" },
      seraph: { tier: "premium" },
      trinity: { tier: "fast" },
      operator: { tier: "fast" },
    },
    categories: {
      source: { tier: "premium" },
      "red-pill": { tier: "premium" },
      "blue-pill": { tier: "standard" },
      "bullet-time": { tier: "fast" },
    },
  } as MatrixxConfig,

  performance: {
    default_tier: "premium",
    agents: {
      trinity: { tier: "fast" },
      operator: { tier: "fast" },
    },
    categories: {
      "bullet-time": { tier: "fast" },
    },
  } as MatrixxConfig,

  frontier: {
    default_tier: "frontier",
    agents: {
      trinity: { tier: "fast" },
      operator: { tier: "fast" },
    },
    categories: {
      "bullet-time": { tier: "fast" },
    },
  } as MatrixxConfig,
}

export function expandPreset(preset: PresetName): MatrixxConfig {
  return PRESETS[preset]
}
