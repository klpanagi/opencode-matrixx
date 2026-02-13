import { z } from "zod"

export const MatrixLoopConfigSchema = z.object({
  /** Enable matrix loop functionality (default: false - opt-in feature) */
  enabled: z.boolean().default(false),
  /** Default max iterations if not specified in command (default: 100) */
  default_max_iterations: z.number().min(1).max(1000).default(100),
  /** Custom state file directory relative to project root (default: .opencode/) */
  state_dir: z.string().optional(),
})

export type MatrixLoopConfig = z.infer<typeof MatrixLoopConfigSchema>
