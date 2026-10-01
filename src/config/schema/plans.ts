import { z } from "zod"
import { SMITH_MAX_REVIEW_ROUNDS } from "../../agents/oracle/high-accuracy-mode"
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
    .describe("Max bytes for a single plan file (default: 140KB, min: 10KB, max: 512KB)"),
  smith_max_review_rounds: z
    .number()
    .int()
    .min(2)
    .max(20)
    .default(SMITH_MAX_REVIEW_ROUNDS)
    .optional()
    .describe(
      "Ceiling on Smith review rounds in Oracle high-accuracy mode. Burn control only — the loop normally exits earlier on convergence (default: 8, min: 2, max: 20)",
    ),
})

export type PlansConfig = z.infer<typeof PlansConfigSchema>
