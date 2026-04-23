import { z } from "zod"

export const RuntimeFallbackConfigSchema = z.object({
  /** Enable automatic model fallback on quota/rate errors (default: false) */
  enabled: z.boolean().optional().default(false),
  /** HTTP status codes that trigger fallback (default: [429, 500, 502, 503, 504]) */
  retry_on_errors: z.array(z.number()).optional().default([429, 500, 502, 503, 504]),
  /** Maximum number of fallback attempts per session (default: 3) */
  max_fallback_attempts: z.number().optional().default(3),
  /** Seconds a failed model stays in cooldown before being retried (default: 60) */
  cooldown_seconds: z.number().optional().default(60),
  /** Seconds to wait for a response before triggering timeout-based fallback (default: 30, 0 = disabled) */
  timeout_seconds: z.number().optional().default(30),
  /** Show a toast notification when switching to a fallback model (default: true) */
  notify_on_fallback: z.boolean().optional().default(true),
})

export type RuntimeFallbackConfig = z.infer<typeof RuntimeFallbackConfigSchema>
