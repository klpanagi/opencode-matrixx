import { z } from "zod"

export const TddEnforcerConfigSchema = z.object({
  /** Enable the tdd-enforcer skill (RED-GREEN-REFACTOR enforcement, bun test conventions). Default: false. */
  enabled: z.boolean().default(false),
})

export type TddEnforcerConfig = z.infer<typeof TddEnforcerConfigSchema>
