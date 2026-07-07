export const BDD_CONTRACT_TEMPLATE = `# /bdd-contract

Generate BDD Contract JSON from one or more Gherkin .feature files. The .feature file must be 100% pure Gherkin (no '# @annotation' comments). The bdd-contract agent infers all annotations (api/ui/state/assumptions) via LLM reasoning from feature content.

## Usage

Single file:
\`\`\`
/bdd-contract <feature-path> [--force]
\`\`\`

Batch (directory or glob):
\`\`\`
/bdd-contract <dir> [--force]
/bdd-contract "<dir>/**/*.feature" [--force]
\`\`\`

## Workflow

Single file:
1. Parse the .feature file using bdd_parse_gherkin tool (deterministic AST)
2. Create initial Contract JSON using bdd_create_contract tool (deterministic, empty annotations)
3. ENRICH the Contract: the bdd-contract agent infers annotations (api/ui/state/assumptions) via LLM reasoning from feature content and edits the Contract JSON file in place
4. **VALIDATE**: call bdd_validate_contract on the file -- if it returns errors, fix the contract and re-validate. The contract must conform to the strict ContractSchema (all annotation field names must match the required naming conventions: kebab-case for routes/testIds, camelCase for state variables, dotted kebab-case for string keys).
5. Report the Contract file path, key features identified, and annotations inferred

Batch input (directory or glob):
1. Expand the input into a list of .feature files
2. For each .feature file, run the single-file workflow above
3. Report a summary of all generated contracts (count, paths, any failures)

## Output

Single file: a \`<file>.contract.json\` alongside the source .feature file, conforming to ContractSchema v1 with schemaVersion: 1, scenarios, and LLM-inferred annotations.

Batch: one contract file per source .feature, written next to each source file.

## Git Actions (HARD RULE)
NEVER run \`git commit\`, \`git add\`, \`git push\`, \`git rebase\`, \`git reset\`, \`git tag\`, or any other git command in this command context. The pipeline runner is responsible for version control. You may only create/edit the generated contract JSON.
`
