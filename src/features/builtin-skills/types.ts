export interface McpServerDefinition {
  type?: "http" | "sse" | "stdio"
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
  disabled?: boolean
}

export type SkillMcpConfig = Record<string, McpServerDefinition>


export interface BuiltinSkill {
  name: string
  description: string
  template: string
  license?: string
  compatibility?: string
  metadata?: Record<string, unknown>
  allowedTools?: string[]
  agent?: string
  model?: string
  subtask?: boolean
  argumentHint?: string
  mcpConfig?: SkillMcpConfig
}
