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
4. ENRICH the Contract by INFERRING annotations via LLM reasoning from the feature content. The Contract schema is strict and rejects unknown fields -- conform to it exactly:
   - annotations.api: { endpoints: [{ method: GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS, path: '/...', request?, response?, description? }], responses: [{ status: 100-599, format: json|html|text|xml|binary, description? }] }
   - annotations.ui: { routes: [{ name: kebab-case, path: '/...' }], testIds: [{ name: kebab-case, value: kebab-case }], strings: [{ key: 'category.name' (dotted kebab-case), value: 'text' }] }
   - annotations.state: { variables: [{ name: camelCase, type: string|number|boolean|object|array|null, default? }], transitions: [{ from, to, trigger }] }
   - annotations.assumptions: string[]
   - All nested objects use .strict() -- reject unknown fields
5. VALIDATION GATE: After every edit to the Contract JSON, call bdd_validate_contract. If it returns errors, fix the contract and re-validate. Do not declare success until validation passes.
6. Report the contract file path + key features identified + annotations inferred
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
- After every edit, call bdd_validate_contract to confirm schema conformance
- DO NOT generate test code, frontend code, or backend code -- delegate to other agents
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
