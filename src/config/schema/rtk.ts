import { z } from "zod"

export const RtkConfigSchema = z.object({
  /** Enable RTK bash command rewriter (default: false — opt-in feature) */
  enabled: z.boolean().default(false),
  /** Path to rtk binary (default: "rtk" in PATH) */
  binary_path: z.string().optional(),
  /** Timeout in ms for rtk rewrite subprocess (default: 5000) */
  timeout_ms: z.number().int().min(1000).max(30000).default(5000),
})

export type RtkConfig = z.infer<typeof RtkConfigSchema>
