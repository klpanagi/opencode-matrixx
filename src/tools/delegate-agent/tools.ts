import { type PluginInput, type ToolDefinition, tool } from "@opencode-ai/plugin"
import type { BackgroundManager } from "../../features/background-agent"
import { log } from "../../shared"
import { executeBackground } from "./background-executor"
import { ALLOWED_AGENTS, CALL_DELEGATE_AGENT_DESCRIPTION } from "./constants"
import { executeSync } from "./sync-executor"
import type { AllowedAgentType, DelegateAgentArgs, ToolContextWithMetadata } from "./types"

export function createDelegateAgent(
  ctx: PluginInput,
  backgroundManager: BackgroundManager,
  disabledAgents: string[] = []
): ToolDefinition {
  const agentDescriptions = ALLOWED_AGENTS.map(
    (name) => `- ${name}: Specialized agent for ${name} tasks`
  ).join("\n")
  const description = CALL_DELEGATE_AGENT_DESCRIPTION.replace("{agents}", agentDescriptions)

  return tool({
    description,
    args: {
      description: tool.schema.string().describe("A short (3-5 words) description of the task"),
      prompt: tool.schema.string().describe("The task for the agent to perform"),
      subagent_type: tool.schema
        .string()
        .describe("The type of specialized agent to use for this task (explore or librarian only)"),
      run_in_background: tool.schema
        .boolean()
        .default(false)
        .describe("true: run asynchronously (use background_output to get results), false: run synchronously and wait for completion. Default: false"),
      session_id: tool.schema.string().describe("Existing Task session to continue").optional(),
    },
    async execute(args: DelegateAgentArgs, toolContext) {
      const toolCtx = toolContext as ToolContextWithMetadata
      log(`[delegate_agent] Starting with agent: ${args.subagent_type}, background: ${args.run_in_background}`)

      // Case-insensitive agent validation - allows "Explore", "EXPLORE", "explore" etc.
      if (
        !ALLOWED_AGENTS.some(
          (name) => name.toLowerCase() === args.subagent_type.toLowerCase(),
        )
      ) {
        return `Error: Invalid agent type "${args.subagent_type}". Only ${ALLOWED_AGENTS.join(", ")} are allowed.`
      }

      const normalizedAgent = args.subagent_type.toLowerCase() as AllowedAgentType
      args = { ...args, subagent_type: normalizedAgent }
      // Hardening: Mouse is a leaf executor — only trinity/operator allowed via delegate_agent
      // Prevents Morpheus → Mouse → Oracle extra hop (plan files owned by oracle)
      const callerAgent = (toolCtx.agent || "").toLowerCase()
      const MOUSE_RESEARCH_ONLY = ["trinity", "operator"] as const
      if (callerAgent === "mouse" && !(MOUSE_RESEARCH_ONLY as readonly string[]).includes(normalizedAgent)) {
        return `Error: Mouse is a leaf executor. delegate_agent with subagent_type="${normalizedAgent}" is BLOCKED. Only trinity/operator allowed for research. Plan files (.matrixx/plans/*.md) must be created via task(subagent_type="oracle") from Morpheus, never via Mouse → Oracle. Route plan generation directly from Morpheus to oracle.`
      }

      if (disabledAgents.some((disabled) => disabled.toLowerCase() === normalizedAgent)) {
        return `Error: Agent "${normalizedAgent}" is disabled via disabled_agents configuration. Remove it from disabled_agents in your matrixx.json to use it.`
      }

      if (args.run_in_background) {
        if (args.session_id) {
          return `Error: session_id is not supported in background mode. Use run_in_background=false to continue an existing session.`
        }
        return await executeBackground(args, toolCtx, backgroundManager, ctx.client)
      }

      return await executeSync(args, toolCtx, ctx)
    },
  })
}
