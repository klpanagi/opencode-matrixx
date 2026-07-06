export const BDD_FRONTEND_TEMPLATE = `# /bdd-frontend

Generate React components and a dev preview server from a BDD Contract JSON.

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
6. Generate a preview-server.ts for visual review

## Output
React component files (.tsx) with TypeScript props, design tokens, data-testid attributes, and a preview-server.ts for visual review.`
