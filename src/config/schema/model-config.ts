import { z } from "zod"

export const ModelFallbackEntrySchema = z.object({
  providers: z.array(z.string().min(1)),
  model: z.string().min(1),
  variant: z.string().optional(),
})

export type ModelFallbackEntry = z.infer<typeof ModelFallbackEntrySchema>

const complexityDowngradeValueSchema = z.string().refine(
  (s) => {
    // provider/model format: must contain exactly one "/" with non-empty parts
    if (s.includes("/")) {
      const parts = s.split("/")
      return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0
    }
    return false
  },
  { message: "Must be <provider>/<model>" },
)

export const ComplexityDowngradesSchema = z.record(
  z.string(),
  z.record(z.string(), complexityDowngradeValueSchema),
)

export type ComplexityDowngrades = z.infer<typeof ComplexityDowngradesSchema>

export const AgentModelRequirementsSchema = z.object({
  fallbackChain: z.array(ModelFallbackEntrySchema),
  requiresModel: z.string().optional(),
  requiresAnyModel: z.boolean().optional(),
  requiresProvider: z.array(z.string()).optional(),
  variant: z.string().optional(),
})

export type AgentModelRequirements = z.infer<typeof AgentModelRequirementsSchema>

export const CategoryModelRequirementsSchema = z.object({
  fallbackChain: z.array(ModelFallbackEntrySchema),
  requiresModel: z.string().optional(),
  requiresAnyModel: z.boolean().optional(),
  requiresProvider: z.array(z.string()).optional(),
  variant: z.string().optional(),
})

export type CategoryModelRequirements = z.infer<typeof CategoryModelRequirementsSchema>

export const ModelRequirementsSchema = z.object({
  agents: z.record(z.string(), AgentModelRequirementsSchema).optional(),
  categories: z.record(z.string(), CategoryModelRequirementsSchema).optional(),
})

export type ModelRequirements = z.infer<typeof ModelRequirementsSchema>

export const DEFAULT_MODEL_CONFIG = {} as const
