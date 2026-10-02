import { z } from "zod"
import { CONTEXT_MODE_DEFAULT_BLOCKED_TOOLS } from "../../shared/context-mode-enforcement"

const BlockedToolNameSchema = z.enum(["read", "grep", "glob", "bash", "webfetch"])

export const ContextModeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  enforce: z.boolean().default(false),
  blocked_tools: z.array(BlockedToolNameSchema).default([...CONTEXT_MODE_DEFAULT_BLOCKED_TOOLS]),
})

export type ContextModeConfig = z.infer<typeof ContextModeConfigSchema>
