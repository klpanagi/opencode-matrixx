export const BDD_FRONTEND_TEMPLATE = `# /bdd-frontend

Generate React components from a BDD Contract JSON.

## Usage
\`\`\`
/bdd-frontend <contract.json>
\`\`\`

## Workflow
1. Read the Contract JSON
2. Extract @ui:* annotations (routes, testIds, strings)
3. Generate React components for each route/feature
4. Implement form fields from state variables
5. Apply test IDs and accessibility attributes

## Output
React component files (.tsx) with TypeScript props, design tokens, and data-testid attributes.`
