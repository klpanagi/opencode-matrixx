import type { BuiltinSkill } from "../types"

export const BDD_CONTRACT_SKILL_NAME = "bdd-contract"

const BDD_CONTRACT_SKILL_DESCRIPTION =
  "BDD contract creation: Gherkin AST → structured Contract JSON with semantic enrichment. Use when authoring or enriching BDD contracts from feature files."

export const bddContractSkill: BuiltinSkill = {
  name: BDD_CONTRACT_SKILL_NAME,
  description: BDD_CONTRACT_SKILL_DESCRIPTION,
  template: `# BDD Contract Creation

## Overview
Transform Gherkin .feature files into structured Contract JSON with LLM-inferred annotations. The .feature file must be 100% pure Gherkin — NO '# @annotation' comments. The bdd-contract agent infers all api/ui/state/assumptions annotations from feature content via LLM reasoning.

## Workflow
1. Parse Gherkin file → \`bdd_parse_gherkin\` tool (deterministic AST)
2. Create Contract → \`bdd_create_contract\` tool (AST → Contract JSON with EMPTY annotations)
3. Enrich → Agent infers annotations by LLM reasoning from feature content and edits the Contract JSON file in place

## Contract Schema Fields
- \`schemaVersion\`: Always 1 (current)
- \`generatedAt\`: ISO 8601 timestamp
- \`sourceFile\`: Original .feature path
- \`feature\`: name, description, tags, annotations
- \`scenarios\`: array of scenario objects with steps, examples, data tables
- \`background\`: optional setup steps
- \`rules\`: optional Gherkin 6+ rules
- \`annotations\`: structured api/ui/state/assumptions (INFERRED BY LLM)

## Annotation Inference (LLM-based)
The tool ALWAYS produces empty annotations. The bdd-contract agent fills them via LLM inference from feature content:
- \`@api:endpoint METHOD /path\` — INFER from HTTP verb/path patterns in scenario steps (NOT in .feature file)
- \`@api:response STATUS description\` — INFER from response/return patterns in steps
- \`@ui:route path=value\` — INFER from page/screen/navigation patterns in steps
- \`@ui:testid key=value\` — INFER from element/form/button patterns in steps
- \`@ui:string category.key=value\` — INFER from label/placeholder/message patterns in steps
- \`@state:variable name type default\` — INFER from form field names + types + defaults in steps
- \`@assumption: text\` — INFER from implicit preconditions in feature description/scenarios

## Inference Signals
- Feature name + description (high-level intent)
- Scenario names + tags (specific behaviors)
- Step text (concrete actions, field names, expected outcomes)
- Background steps (preconditions)

## Guidelines
- Be conservative: only infer what is clearly evidenced by the feature content
- Annotations are derived insight, not invented detail — prefer accuracy over completeness
- .feature files MUST be 100% pure Gherkin (no '# @' comments)

## Delivery
Report the contract file path and the annotations inferred (api/ui/state/assumptions).

## Batch Mode
When the input is a directory or glob of .feature files:
1. Expand the input into a list of .feature files
2. For each .feature file, run the deterministic tools (\`bdd_parse_gherkin\` + \`bdd_create_contract\`) in a loop — the contract phase needs no LLM
3. Report a summary (count, paths, any failures) in a single message
4. The contract phase is fast and deterministic, so parallelism is not required`
}
