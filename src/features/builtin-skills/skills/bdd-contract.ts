import type { BuiltinSkill } from "../types"

export const BDD_CONTRACT_SKILL_NAME = "bdd-contract"

const BDD_CONTRACT_SKILL_DESCRIPTION =
  "BDD contract creation: Gherkin AST → structured Contract JSON with semantic enrichment. Use when authoring or enriching BDD contracts from feature files."

export const bddContractSkill: BuiltinSkill = {
  name: BDD_CONTRACT_SKILL_NAME,
  description: BDD_CONTRACT_SKILL_DESCRIPTION + ' NEVER commits or runs git in this skill context.',
  template: `# BDD Contract Creation

## Overview
Transform Gherkin .feature files into structured Contract JSON with LLM-inferred annotations. The .feature file must be 100% pure Gherkin — NO '# @annotation' comments. The bdd-contract agent infers all api/ui/state/assumptions annotations from feature content via LLM reasoning, and the output MUST conform to the strict ContractSchema.

## Workflow
1. Parse Gherkin file → \`bdd_parse_gherkin\` tool (deterministic AST)
2. Create Contract → \`bdd_create_contract\` tool (AST → Contract JSON with EMPTY annotations)
3. Enrich → Agent infers annotations by LLM reasoning from feature content and edits the Contract JSON file in place
4. **Validation Gate (MANDATORY)** → Call \`bdd_validate_contract\` on the file after every edit. If it returns errors, fix the contract and re-validate. Do not declare success until validation passes.

## Contract Schema Fields
- \`schemaVersion\`: Always 1 (current)
- \`generatedAt\`: ISO 8601 timestamp
- \`sourceFile\`: Original .feature path
- \`feature\`: { name, description?, tags[], annotations? } — \`feature.annotations\` is reserved and must be \`{}\` if present
- \`scenarios\`: array of scenario objects with steps, examples, data tables
- \`background\`: optional setup steps
- \`rules\`: optional Gherkin 6+ rules
- \`annotations\`: structured { api?, ui?, state?, assumptions? } (INFERRED BY LLM, validated against strict schema)

## Annotation Schema (strict — all nested objects use .strict() to reject unknown fields)
The agent MUST conform to this exact shape. Every name, path, and key follows a specific convention.

**Naming conventions (enforced by regex):**
- \`name\` for \`routes\` and \`testIds\` → kebab-case: \`^[a-z][a-z0-9-]*$\`
- \`value\` for \`testIds\` → kebab-case: \`^[a-z][a-z0-9-]*$\`
- \`path\` for \`endpoints\` and \`routes\` → must start with \`/\`
- \`name\` for \`state.variables\` → camelCase: \`^[a-z][a-zA-Z0-9]*$\`
- \`key\` for \`ui.strings\` → dotted kebab-case (category.name): \`^[a-z][a-z0-9-]*(.[a-z][a-z0-9-]*)+$\`

**\`annotations.api\`:**
- \`endpoints[]\`: \`{ method: GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS, path: '/...', request?: string, response?: string, description?: string }\`
- \`responses[]\`: \`{ status: integer 100-599, format: json|html|text|xml|binary, description?: string }\`

**\`annotations.ui\`:**
- \`routes[]\`: \`{ name: kebab-case, path: '/...' }\`
- \`testIds[]\`: \`{ name: kebab-case, value: kebab-case }\`
- \`strings[]\`: \`{ key: 'category.name' (dotted kebab), value: 'text' }\`

**\`annotations.state\`:**
- \`variables[]\`: \`{ name: camelCase, type: string|number|boolean|object|array|null, default?: any }\`
- \`transitions[]\`: \`{ from: string, to: string, trigger: string }\`

**\`annotations.assumptions\`:**
- \`string[]\`

## Inference Signals
- Feature name + description (high-level intent)
- Scenario names + tags (specific behaviors)
- Step text (concrete actions, field names, expected outcomes)
- Background steps (preconditions)

## Guidelines
- Be conservative: only infer what is clearly evidenced by the feature content
- Annotations are derived insight, not invented detail — prefer accuracy over completeness
- .feature files MUST be 100% pure Gherkin (no '# @' comments)
- Every name MUST match its required convention — kebab-case, camelCase, or dotted kebab-case
- HTTP methods, response formats, and var types are enums — use exact values, no synonyms
- After every edit, call \`bdd_validate_contract\`. Do not skip this step.

## Delivery
Report the contract file path, the annotations inferred (api/ui/state/assumptions), and confirmation that \`bdd_validate_contract\` returned success.

## Batch Mode
When the input is a directory or glob of .feature files:
1. Expand the input into a list of .feature files
2. For each .feature file, run the deterministic tools (\`bdd_parse_gherkin\` + \`bdd_create_contract\`) in a loop — the contract phase needs no LLM
3. Report a summary (count, paths, any failures) in a single message

## Git Actions (HARD RULE)
NEVER run \`git commit\`, \`git add\`, \`git push\`, \`git rebase\`, \`git reset\`, \`git tag\`, or any other git command in this skill context. The pipeline runner is responsible for version control. You may only create/edit the generated contract JSON.`,
}
