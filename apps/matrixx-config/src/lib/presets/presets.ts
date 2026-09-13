import type { MatrixxConfig } from "$lib/types";

export const PRESET_NAMES = [
  "minimal",
  "balanced",
  "performance",
  "frontier",
] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

export interface PresetMeta {
  name: PresetName;
  label: string;
  description: string;
  tier: string;
}

export const PRESET_METAS: PresetMeta[] = [
  {
    name: "minimal",
    label: "Minimal",
    description:
      "Fast tier by default, free agents for trinity/operator. Lowest cost.",
    tier: "fast",
  },
  {
    name: "balanced",
    label: "Balanced",
    description:
      "Standard tier default. Premium agents for core roles. Best for daily use.",
    tier: "standard",
  },
  {
    name: "performance",
    label: "Performance",
    description: "Premium tier default. Maximum quality for most agents.",
    tier: "premium",
  },
  {
    name: "frontier",
    label: "Frontier",
    description:
      "Frontier tier default. Top models everywhere. Highest quality & cost.",
    tier: "frontier",
  },
];

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
};

export function expandPreset(preset: PresetName): MatrixxConfig {
  return structuredClone(PRESETS[preset]);
}
