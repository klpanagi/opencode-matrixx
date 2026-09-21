import { z } from "zod"

export const TddEnforcerConfigSchema = z.object({
  /** Enable the tdd-enforcer skill (RED-GREEN-REFACTOR enforcement, bun test conventions). Default: true (fail-closed; set enabled:false to opt out). */
  enabled: z.boolean().default(true),
})

export type TddEnforcerConfig = z.infer<typeof TddEnforcerConfigSchema>
