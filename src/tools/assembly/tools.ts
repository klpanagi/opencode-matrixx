import { type ToolDefinition, tool } from "@opencode-ai/plugin"
import type { AssemblyConfig } from "../../config/schema/assembly"
import type { BackgroundManager } from "../../features/background-agent/manager"
import { executeAssembly } from "./assembly-executor"
import { TOOL_DESCRIPTION } from "./tool-description"
import { AssemblyArgsSchema } from "./types"

export interface AssemblyToolOptions {
  manager: BackgroundManager
  pluginConfig?: { assembly?: AssemblyConfig }
}

export function createAssemblyTool(
  options: AssemblyToolOptions,
): ToolDefinition {
  return tool({
    description: TOOL_DESCRIPTION,
    args: {
      question: tool.schema.string().describe("The question or decision to reach consensus on"),
      voters: tool.schema.number().optional().describe("Number of voters (2-5, default: 3)"),
      rounds: tool.schema.number().optional().describe("Number of synthesis rounds (1-3, default: 2)"),
      models: tool.schema.array(tool.schema.string()).optional().describe("Override auto-selected models"),
    },
    async execute(args, toolContext) {
      const parsed = AssemblyArgsSchema.parse(args)

      const output = await executeAssembly({
        manager: options.manager,
        args: parsed,
        config: options.pluginConfig?.assembly,
        sessionID: toolContext.sessionID,
        messageID: toolContext.messageID,
      })

      return output.finalConsensus
    },
  })
}
