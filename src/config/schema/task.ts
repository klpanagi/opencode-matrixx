import { z } from "zod"

/** Task system configuration schema */
export const TaskConfigSchema = z.object({
  /** Poll timeout for blocking task() calls in milliseconds (default: 600000 = 10 minutes, minimum: 60000 = 1 minute).
   * Increase this if you have complex agents (like Oracle) that delegate to sub-agents (like Seraph)
   * and the total wall time exceeds the default 10-minute budget. */
  pollTimeoutMs: z.number().min(60000).optional(),
})

export type TaskConfig = z.infer<typeof TaskConfigSchema>
