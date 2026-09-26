import { z } from "zod"

export const PermissionsConfigSchema = z.object({
  /** Ordered allow rules. Deny-precedence evaluation lands in Wave 6 — schema only here. */
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
  ask: z.array(z.string()).optional(),
})

export type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>
