import { z } from "zod"
import { MAX_PLAN_FILE_BYTES } from "../../features/mission-state/constants"

export const PlansConfigSchema = z.object({
  max_plan_file_bytes: z
    .number()
    .int()
    .min(10 * 1024)
    .max(512 * 1024)
    // Default references the single source of truth — never a second literal
    // (locked decision: exactly ONE definition of the cap lives in
    // features/mission-state/constants.ts).
    .default(MAX_PLAN_FILE_BYTES)
    .optional()
    .describe("Max bytes for a single plan file (default: 100KB, min: 10KB, max: 512KB)"),
})

export type PlansConfig = z.infer<typeof PlansConfigSchema>
