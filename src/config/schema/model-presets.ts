import { z } from "zod"

/**
 * Provider/model format: must contain exactly one "/" with non-empty parts
 * (mirrors the provider/model branch of `complexityDowngradeValueSchema` in
 * `./model-config.ts`).
 */
const providerModelSchema = z.string().refine(
  (s) => {
    if (!s.includes("/")) return false
    const parts = s.split("/")
    return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0
  },
  { message: "Must be <provider>/<model>" },
)

/** A single model assignment inside a preset (agent or category). */
export const ModelPresetEntrySchema = z.object({
  model: providerModelSchema,
  variant: z.string().optional(),
})

export type ModelPresetEntry = z.infer<typeof ModelPresetEntrySchema>

/**
 * A named static model preset — explicit provider/model bundles per
 * agent/category. Applied with fill-in semantics (never overwrites an
 * explicit `model` on the target config entry).
 */
export const ModelPresetSchema = z.object({
  /** Default model applied to any agent/category entry that still has no `model`. */
  default_model: providerModelSchema.optional(),
  /** Per-agent model assignments. */
  agents: z.record(z.string(), ModelPresetEntrySchema).optional(),
  /** Per-category model assignments. */
  categories: z.record(z.string(), ModelPresetEntrySchema).optional(),
})

export type ModelPreset = z.infer<typeof ModelPresetSchema>

/** Registry of named presets keyed by preset name. */
export const ModelPresetsSchema = z.record(z.string(), ModelPresetSchema)

export type ModelPresets = z.infer<typeof ModelPresetsSchema>

/** Name of the active preset in `model_presets`. */
export const ActivePresetSchema = z.string().min(1)

export type ActivePreset = z.infer<typeof ActivePresetSchema>