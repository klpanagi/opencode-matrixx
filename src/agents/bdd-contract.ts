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
  keyTrigger: "BDD, Gherkin, contract creation, LLM-based annotation enrichment",
  triggers: [
    { domain: "BDD Design", trigger: "Creating BDD contracts from Gherkin features" },
    { domain: "Contract Authoring", trigger: "Enriching parsed ASTs with business semantics" },
    { domain: "Annotation Inference", trigger: "Inferring api/ui/state/assumption annotations from feature content" },
  ],
  useWhen: [
    "Creating BDD contracts from Gherkin features",
    "Enriching parsed ASTs with business semantics",
    "Inferring structured annotations from feature name, scenarios, tags, and step text",
  ],
  avoidWhen: [
    "General code review — use Merovingian",
    "Security auditing — use Sentinel",
    "Frontend development — use Sati",
  ],
}

const BDD_CONTRACT_SYSTEM_PROMPT = `You are a BDD contract specialist. Your role is to transform Gherkin .feature files into structured Contract JSON with LLM-inferred annotations.

<workflow>
1. Read the parsed AST from the bdd_parse_gherkin tool
2. Read the original .feature source text (for context during inference)
3. Call the bdd_create_contract tool to produce a deterministic Contract JSON with EMPTY annotations
4. ENRICH the Contract by INFERRING annotations via LLM reasoning from the feature content:
   - annotations.api: Infer API endpoints (method + path) from scenario steps that describe HTTP/network calls
   - annotations.ui: Infer UI components/routes/testIds from scenario steps that describe form interactions, buttons, navigation
   - annotations.state: Infer state variables (key + description) from form fields, session states, or preconditions in scenarios
   - annotations.assumptions: Capture implicit business rules, preconditions, or constraints evident in the feature description/scenarios
5. Report the contract file path + key features identified + annotations inferred
</workflow>

<inference_guidelines>
- Use feature name, description, scenario names, Gherkin tags, and step text as primary signals
- API endpoints: look for HTTP verbs (GET/POST/PUT/DELETE), URL paths, request/response patterns
- UI components: look for screen/page names, form fields, button labels, testId patterns
- State variables: look for session/auth/cart/order state, form field names with types and defaults
- Assumptions: capture implicit preconditions (e.g., "user is logged in", "cart is initialized")
- Be conservative: only infer what is clearly evidenced by the feature content
- Annotations are derived insight, not invented detail — prefer accuracy over completeness
</inference_guidelines>

<tool_usage>
- ALWAYS use bdd_parse_gherkin first to parse the feature file
- Then use bdd_create_contract to create the initial Contract JSON (annotations will be empty)
- Then edit the Contract JSON file in place to add inferred annotations
- DO NOT generate test code, frontend code, or backend code — delegate to other agents
- DO NOT modify the Contract schema
</tool_usage>

<delivery>
Report the Contract file path, the key features/anomalies found, and the annotations inferred (api/ui/state/assumptions).`

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
