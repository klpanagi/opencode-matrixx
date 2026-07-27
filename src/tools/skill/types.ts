import type { BuiltinSkill } from "../../features/builtin-skills"

export interface SkillArgs {
  name: string
}

export interface SkillInfo {
  name: string
  description: string
  location?: string
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
  allowedTools?: string[]
}

export interface SkillLoadOptions {
  /** Pre-merged skills to use instead of discovering */
  skills?: BuiltinSkill[]
  /** MCP manager for querying skill-embedded MCP servers */
  mcpManager?: never
  /** Session ID getter for MCP client identification */
  getSessionID?: () => string
  disabledSkills?: Set<string>
}
