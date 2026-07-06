export const BDD_TESTS_TEMPLATE = `# /bdd-tests

Generate Cucumber step definitions and page objects from a BDD Contract JSON.

## Usage
\`\`\`
/bdd-tests <contract.json>
\`\`\`

## Workflow
1. Read the Contract JSON file
2. Extract feature scenarios and their steps
3. Generate Cucumber step definition files (Given/When/Then/And/But)
4. Generate page object classes for UI interactions
5. Verify with \`npx cucumber-js\` via bash

## Output
Step definition files (.steps.ts) and page object files (.page.ts) in a tests/ directory.`
