import { z } from "zod"

export const ScholarConfigSchema = z.object({
  /**
   * Semantic Scholar API key for higher rate limits.
   * User config (`~/.config/opencode/matrixx.jsonc`) only — never project
   * config, never logs. Passed as the `x-api-key` header inside the scholar
   * MCP process only. When absent, S2 is used anonymously at 1 RPS.
   */
  s2ApiKey: z.string().min(1).optional(),
  /**
   * Contact email sent as the OpenAlex `mailto:` User-Agent header
   * (polite pool). User config only. When absent, OpenAlex is queried
   * without a mailto contact at default (unthrottled-pool) limits.
   */
  mailto: z.string().email().optional(),
})

export type ScholarConfig = z.infer<typeof ScholarConfigSchema>
