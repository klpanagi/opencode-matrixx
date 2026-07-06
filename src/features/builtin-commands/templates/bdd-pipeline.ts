export const BDD_PIPELINE_TEMPLATE = `# /bdd-pipeline

Full BDD pipeline: generate contract, tests, frontend, and backend from a .feature file.

## Usage
\`\`\`
/bdd-pipeline <feature-path> [--force]
\`\`\`

## Pipeline Steps
1. /bdd-contract <feature> — Parse feature → generate Contract JSON
2. /bdd-tests <contract> — Generate Cucumber step definitions + page objects
3. /bdd-frontend <contract> — Generate React components
4. /bdd-backend <contract> — Generate typed API services

## Output
All 4 outputs: Contract JSON, test files, components, and API services.`
