import type { ALLOWED_AGENTS } from "./constants"

export type AllowedAgentType = (typeof ALLOWED_AGENTS)[number]

export interface DelegateAgentArgs {
  description: string
  prompt: string
  subagent_type: string
  run_in_background: boolean
  session_id?: string
}

export type ToolContextWithMetadata = {
  sessionID: string
  messageID: string
  agent: string
  abort: AbortSignal
  metadata?: (input: { title?: string; metadata?: Record<string, unknown> }) => void
}
