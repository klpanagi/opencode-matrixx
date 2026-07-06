export const BDD_CONTRACT_TEMPLATE = `# /bdd-contract

Generate a BDD Contract JSON from a Gherkin .feature file.

## Usage
\`\`\`
/bdd-contract <feature-path> [--force]
\`\`\`

## Workflow
1. Parse the .feature file using bdd_parse_gherkin tool
2. Create initial Contract JSON using bdd_create_contract tool
3. Enrich the Contract with semantic insights (naming, business rules, annotation refinement)
4. Report the Contract file path and key features identified

## Output
A .contract.json file alongside the source .feature file, conforming to ContractSchema v1 with schemaVersion: 1, annotations, scenarios, and enriched metadata.`
