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
  model: string;
}

export const PRESET_METAS: PresetMeta[] = [
  {
    name: "minimal",
    label: "Minimal",
    description:
      "Cost-effective defaults with lightweight models for trinity/operator.",
    model: "provider/model",
  },
  {
    name: "balanced",
    label: "Balanced",
    description:
      "Balanced quality and cost. Strong models for core roles. Best for daily use.",
    model: "provider/model",
  },
  {
    name: "performance",
    label: "Performance",
    description: "High-quality defaults. Maximum quality for most agents.",
    model: "provider/model",
  },
  {
    name: "frontier",
    label: "Frontier",
    description:
      "Cutting-edge defaults. Top models everywhere. Highest quality & cost.",
    model: "provider/model",
  },
];

const PRESETS: Record<PresetName, MatrixxConfig> = {
  minimal: {
    tasks: { enabled: true, scope: "project" },
    experimental: { task_system: true },
  } as MatrixxConfig,

  balanced: {
    tasks: { enabled: true, scope: "project" },
    experimental: { task_system: true },
    background_task: { wakeScheduler: { enabled: true } },
  } as MatrixxConfig,

  performance: {
    tasks: { enabled: true, scope: "project" },
    experimental: { task_system: true, preemptive_compaction: true },
    background_task: { wakeScheduler: { enabled: true } },
    runtime_fallback: { enabled: true },
  } as MatrixxConfig,

  frontier: {
    tasks: { enabled: true, scope: "project", session_scoped: false },
    experimental: { task_system: true, preemptive_compaction: true },
    background_task: { wakeScheduler: { enabled: true } },
    runtime_fallback: { enabled: true },
    security: { secret_scanning: { enabled: true } },
  } as MatrixxConfig,
};

export function expandPreset(preset: PresetName): MatrixxConfig {
  return structuredClone(PRESETS[preset]);
}
