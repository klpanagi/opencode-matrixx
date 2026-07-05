import { z } from "zod"

/** Assembly tool — provider model configuration for multi-model voting */
export const AssemblyConfigSchema = z.object({
  /** Provider-model pairs for auto-selection */
  providers: z
    .array(
      z.object({
        providerID: z.string(),
        modelID: z.string(),
      }),
    )
    .optional(),
  /** Default number of voters (2-5) */
  default_voters: z.number().int().min(2).max(5).optional(),
  /** Default number of synthesis rounds (1-3) */
  default_rounds: z.number().int().min(1).max(3).optional(),
  /** Maximum wait time per voter in ms */
  timeout_ms: z.number().int().min(10_000).max(300_000).optional(),
  /** Enable assembly tool (default: true — available in every session) */
  enabled: z.boolean().default(false),
  })

export type AssemblyConfig = z.infer<typeof AssemblyConfigSchema>
