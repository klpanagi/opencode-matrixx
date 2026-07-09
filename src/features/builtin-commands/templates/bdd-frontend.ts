export const BDD_FRONTEND_TEMPLATE = `# /bdd-frontend

Generate React components and a dev preview server from one or more BDD Contract JSON files.

## Usage

Single file:
\`\`\`
/bdd-frontend <contract.json>
\`\`\`

Batch (directory or glob):
\`\`\`
/bdd-frontend <dir> --out <out-dir>
/bdd-frontend "<dir>/**/*.contract.json" --out <out-dir>
\`\`\`

## Workflow

Single file:
1. Read the Contract JSON
2. Extract @ui:* annotations (routes, testIds, strings)
3. Generate React components for each route/feature
4. Implement form fields from state variables
5. Apply test IDs and accessibility attributes
6. Generate a preview-server.ts for visual review

Batch input (directory or glob):
1. Expand the input into a list of .contract.json files
2. For each contract, run the single-file workflow above
3. Use background subagents (\`task(run_in_background=true)\`) to run each in parallel (up to 5 concurrent)
4. Wait for all to finish, then collect results and report a summary

## Output

Single file: React component files (.tsx) with TypeScript props, design tokens, data-testid attributes, and a preview-server.ts for visual review.

Batch: per-feature component subdirectory tree under \`<out-dir>/<feature>/components/\`, with one preview-server.ts per feature.

## Git Actions (HARD RULE)
NEVER run \`git commit\`, \`git add\`, \`git push\`, \`git rebase\`, \`git reset\`, \`git tag\`, or any other git command in this command context. The pipeline runner is responsible for version control. You may only create/edit the generated files in the target output directory.
`
