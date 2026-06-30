import { type ToolDefinition, tool } from "@opencode-ai/plugin"
import type { ConsensusConfig } from "../../config/schema/consensus"
import type { BackgroundManager } from "../../features/background-agent/manager"
import { executeConsensus } from "./consensus-executor"
import { TOOL_DESCRIPTION } from "./tool-description"
import { ConsensusArgsSchema } from "./types"

export interface ConsensusToolOptions {
  manager: BackgroundManager
  pluginConfig?: { consensus?: ConsensusConfig }
}

export function createConsensusTool(
  options: ConsensusToolOptions,
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
      const parsed = ConsensusArgsSchema.parse(args)

      const output = await executeConsensus({
        manager: options.manager,
        args: parsed,
        config: options.pluginConfig?.consensus,
        sessionID: toolContext.sessionID,
        messageID: toolContext.messageID,
      })

      return output.finalConsensus
    },
  })
}
