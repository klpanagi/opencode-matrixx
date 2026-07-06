export const BDD_CONTRACT_TEMPLATE = `# /bdd-contract

Generate BDD Contract JSON from one or more Gherkin .feature files.

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
1. Parse the .feature file using bdd_parse_gherkin tool
2. Create initial Contract JSON using bdd_create_contract tool
3. Enrich the Contract with semantic insights (naming, business rules, annotation refinement)
4. Report the Contract file path and key features identified

Batch input (directory or glob):
1. Expand the input into a list of .feature files
2. For each .feature file, run the single-file workflow above
3. Report a summary of all generated contracts (count, paths, any failures)

## Output

Single file: a \`<file>.contract.json\` alongside the source .feature file, conforming to ContractSchema v1 with schemaVersion: 1, annotations, scenarios, and enriched metadata.

Batch: one contract file per source .feature, written next to each source file.`

