import type { AgentConfig } from "@opencode-ai/sdk"
import { BDD_BACKEND_SKILL_NAME } from "../features/builtin-skills/skills/bdd-backend"
import { createAgentToolRestrictions } from "../shared/permission-compat"
import type { AgentMode, AgentPromptMetadata } from "./types"
import { isGptModel } from "./types"

const MODE: AgentMode = "all"

const BACKEND_ENGINEER_SKILLS = [BDD_BACKEND_SKILL_NAME]

export const BACKEND_ENGINEER_PROMPT_METADATA: AgentPromptMetadata = {
  category: "specialist",
  cost: "EXPENSIVE",
  promptAlias: "BackendEngineer",
  keyTrigger: "API service generation, typed backend, REST endpoints, request/response types",
  triggers: [
    { domain: "API Endpoint Authoring", trigger: "Generating typed API services from contracts" },
    { domain: "Request/Response Typing", trigger: "Building request/response type definitions from annotations" },
    { domain: "Service Layer Modeling", trigger: "Modeling service layer code from BDD contracts" },
  ],
  useWhen: [
    "Generating typed API services from contracts",
    "Building request/response type definitions",
    "Creating service layer code from BDD specifications",
  ],
  avoidWhen: [
    "Frontend work — use Sati",
    "Database migrations",
    "Security auditing — use Sentinel",
  ],
}

const BACKEND_ENGINEER_SYSTEM_PROMPT = `You are a Backend Engineer specializing in API service generation from BDD contracts. Your role is to generate typed, production-ready backend services.

<workflow>
1. Read the Contract JSON file
2. Extract @api:endpoint and @api:response annotations
3. Generate typed service files (one per endpoint) in target directory
4. Use Zod schemas for runtime request/response validation
5. Report file paths and endpoint summary
</workflow>

<tool_usage>
- Use read to inspect the Contract JSON
- Use bash to verify generated files compile
- DO NOT generate test code or frontend code
- DO NOT modify the Contract
- DO NOT generate database migrations
</tool_usage>

<delivery>
Report the generated service file paths and the endpoints covered.`

export function createBackendEngineerAgent(model: string): AgentConfig {
  const restrictions = createAgentToolRestrictions([])

  const base = {
    description:
      "Backend API service generator. Typed services from BDD contracts, REST endpoints, request/response types. (BackendEngineer - Matrixx)",
    mode: MODE,
    model,
    skills: BACKEND_ENGINEER_SKILLS,
    temperature: 0.1,
    ...restrictions,
    prompt: BACKEND_ENGINEER_SYSTEM_PROMPT,
  } as AgentConfig

  if (isGptModel(model)) {
    return { ...base, maxTokens: 16000, reasoningEffort: "medium", textVerbosity: "high" } as AgentConfig
  }

  return { ...base, maxTokens: 16000, thinking: { type: "enabled", budgetTokens: 10000 } } as AgentConfig
}
createBackendEngineerAgent.mode = MODE
