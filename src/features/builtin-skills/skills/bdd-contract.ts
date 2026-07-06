import type { BuiltinSkill } from "../types"

export const BDD_CONTRACT_SKILL_NAME = "bdd-contract"

const BDD_CONTRACT_SKILL_DESCRIPTION =
  "BDD contract creation: Gherkin AST → structured Contract JSON with semantic enrichment. Use when authoring or enriching BDD contracts from feature files."

export const bddContractSkill: BuiltinSkill = {
  name: BDD_CONTRACT_SKILL_NAME,
  description: BDD_CONTRACT_SKILL_DESCRIPTION,
  template: `# BDD Contract Creation

## Overview
Transform Gherkin .feature files into structured Contract JSON with semantic enrichment.

## Workflow
1. Parse Gherkin file → \`bdd_parse_gherkin\` tool (deterministic AST)
2. Create Contract → \`bdd_create_contract\` tool (AST → Contract JSON with annotations)
3. Enrich → Add business semantics, naming improvements, intent clarification

## Contract Schema Fields
- \`schemaVersion\`: Always 1 (current)
- \`generatedAt\`: ISO 8601 timestamp
- \`sourceFile\`: Original .feature path
- \`feature\`: name, description, tags, annotations
- \`scenarios\`: array of scenario objects with steps, examples, data tables
- \`background\`: optional setup steps
- \`rules\`: optional Gherkin 6+ rules
- \`annotations\`: structured api/ui/state/assumptions

## Annotation Enrichment
- \`@api:endpoint METHOD /path\` → API endpoint metadata
- \`@api:response STATUS description\` → Response metadata
- \`@ui:route path=value\` → UI route configuration
- \`@ui:testid key=value\` → Test ID mapping
- \`@ui:string key=value\` → UI string resources
- \`@state:variable name type default\` → State variable definitions
- \`@assumption: text\` → Business assumptions

## Delivery
Report the contract file path and key features identified.

## Batch Mode
When the input is a directory or glob of .feature files:
1. Expand the input into a list of .feature files
2. For each .feature file, run the deterministic tools (\`bdd_parse_gherkin\` + \`bdd_create_contract\`) in a loop — no LLM needed for the contract phase
3. Report a summary (count, paths, any failures) in a single message
4. The contract phase is fast and deterministic, so parallelism is not required`,
}
