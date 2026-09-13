import { log } from "../shared/logger"
import type { MatrixxConfig } from "./schema/matrixx-config"
import type { ModelPreset, ModelPresetEntry } from "./schema/model-presets"

interface ModelCarrier {
  model?: string
  variant?: string
}

/**
 * Resolve the model entry a preset assigns to a key (agent or category name).
 * Priority: `preset.agents[key]` → `preset.categories[key]` → `preset.default_model`.
 */
export function resolvePresetModel(
  preset: ModelPreset,
  key: string,
): ModelPresetEntry | undefined {
  const entry = preset.agents?.[key] ?? preset.categories?.[key]
  if (entry) return entry
  if (preset.default_model) return { model: preset.default_model }
  return undefined
}

/**
 * Apply the active preset to a config with fill-in semantics (pure).
 *
 * Precedence per agent/category entry: explicit `model` wins over the preset
 * entry, which wins over `preset.default_model`. Only missing `model` (and
 * `variant`) values are filled; the input config is never mutated — a new
 * config object is returned. An unknown `active_preset` is logged and the
 * config is returned unchanged.
 */
export function applyActivePreset(
  config: MatrixxConfig,
  presetName?: string,
): MatrixxConfig {
  const name = presetName ?? config.active_preset
  if (!name) return config

  const preset = config.model_presets?.[name]
  if (!preset) {
    log("[applyActivePreset] unknown active_preset", { active_preset: name })
    return config
  }

  const agents = fillRegistry(config.agents, preset.agents, preset.default_model)
  const categories = fillRegistry(
    config.categories,
    preset.categories,
    preset.default_model,
  )

  const result = { ...config }
  if (agents !== config.agents) result.agents = agents
  if (categories !== config.categories) {
    result.categories = categories as MatrixxConfig["categories"]
  }
  return result
}

function fillRegistry(
  registry: Record<string, ModelCarrier | undefined> | undefined,
  presetEntries: Record<string, ModelPresetEntry> | undefined,
  defaultModel: string | undefined,
): Record<string, ModelCarrier | undefined> | undefined {
  if (!registry) return registry
  let changed = false
  const result: Record<string, ModelCarrier | undefined> = {}
  for (const [name, entry] of Object.entries(registry)) {
    if (!entry) {
      result[name] = entry
      continue
    }
    const filled = applyEntry(entry, presetEntries?.[name], defaultModel)
    if (filled) {
      changed = true
      result[name] = filled
    } else {
      result[name] = entry
    }
  }
  return changed ? result : registry
}

function applyEntry(
  entry: ModelCarrier,
  presetEntry: ModelPresetEntry | undefined,
  defaultModel: string | undefined,
): ModelCarrier | null {
  if (entry.model) return null
  const model = presetEntry?.model ?? defaultModel
  if (!model) return null
  const variant = entry.variant ?? presetEntry?.variant
  if (variant === undefined) return { ...entry, model }
  return { ...entry, model, variant }
}