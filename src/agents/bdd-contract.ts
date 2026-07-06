import type { AgentConfig } from "@opencode-ai/sdk"
import { BDD_CONTRACT_SKILL_NAME } from "../features/builtin-skills/skills/bdd-contract"
import { createAgentToolRestrictions } from "../shared/permission-compat"
import type { AgentMode, AgentPromptMetadata } from "./types"
import { isGptModel } from "./types"

const MODE: AgentMode = "all"

const BDD_CONTRACT_SKILLS = [BDD_CONTRACT_SKILL_NAME]

export const BDD_CONTRACT_PROMPT_METADATA: AgentPromptMetadata = {
  category: "specialist",
  cost: "EXPENSIVE",
  promptAlias: "BddContract",
  keyTrigger: "BDD, Gherkin, contract creation, acceptance criteria synthesis",
  triggers: [
    { domain: "BDD Design", trigger: "Creating BDD contracts from Gherkin features" },
    { domain: "Contract Authoring", trigger: "Enriching parsed ASTs with business semantics" },
    { domain: "Annotation Enrichment", trigger: "Adding structured annotations to feature files" },
  ],
  useWhen: [
    "Creating BDD contracts from Gherkin features",
    "Enriching parsed ASTs with business semantics",
    "Adding structured annotations to feature files",
  ],
  avoidWhen: [
    "General code review — use Merovingian",
    "Security auditing — use Sentinel",
    "Frontend development — use Sati",
  ],
}

const BDD_CONTRACT_SYSTEM_PROMPT = `You are a BDD contract specialist. Your role is to transform Gherkin .feature files into structured Contract JSON with semantic enrichment.

<workflow>
1. Read the parsed AST from the bdd_parse_gherkin tool
2. Read the original .feature source text
3. Call the bdd_create_contract tool to produce a deterministic Contract JSON
4. Enrich the Contract with semantic insights (naming, intent, business rules) by editing the Contract JSON file in place
5. Report the contract file path + key features identified
</workflow>

<tool_usage>
- ALWAYS use bdd_parse_gherkin first to parse the feature file
- Then use bdd_create_contract to create the initial Contract JSON
- Finally enrich the Contract by editing the JSON file
- DO NOT generate test code, frontend code, or backend code — delegate to other agents
- DO NOT modify the Contract schema
</tool_usage>

<delivery>
Report the Contract file path and the key features/anomalies found during enrichment.`

export function createBddContractAgent(model: string): AgentConfig {
  const restrictions = createAgentToolRestrictions([])

  const base = {
    description:
      "BDD contract specialist. Gherkin feature files → structured Contract JSON with semantic enrichment. (BddContract - Matrixx)",
    mode: MODE,
    model,
    skills: BDD_CONTRACT_SKILLS,
    temperature: 0.1,
    ...restrictions,
    prompt: BDD_CONTRACT_SYSTEM_PROMPT,
  } as AgentConfig

  if (isGptModel(model)) {
    return { ...base, maxTokens: 16000, reasoningEffort: "medium", textVerbosity: "high" } as AgentConfig
  }

  return { ...base, maxTokens: 16000, thinking: { type: "enabled", budgetTokens: 10000 } } as AgentConfig
}
createBddContractAgent.mode = MODE
