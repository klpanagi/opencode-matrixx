export const BDD_BACKEND_TEMPLATE = `# /bdd-backend

Generate typed API services from one or more BDD Contract JSON files.

## Usage

Single file:
\`\`\`
/bdd-backend <contract.json> --out <out-dir>
\`\`\`

Batch (directory or glob):
\`\`\`
/bdd-backend <dir> --out <out-dir>
/bdd-backend "<dir>/**/*.contract.json" --out <out-dir>
\`\`\`

## Workflow

Single file:
1. Read the Contract JSON
2. Extract @api:endpoint and @api:response annotations
3. Generate typed service files with Zod request/response schemas
4. One service function per endpoint
5. Report generated file paths

Batch input (directory or glob):
1. Expand the input into a list of .contract.json files
2. For each contract, run the single-file workflow above
3. Use background subagents (\`task(run_in_background=true)\`) to run each in parallel (up to 5 concurrent)
4. Wait for all to finish, then collect results and report a summary

## Output

Single file: TypeScript service files (.ts) with Zod validation schemas for each API endpoint.

Batch: per-feature service subdirectory tree under \`<out-dir>/<feature>/backend/\`.

## Git Actions (HARD RULE)
NEVER run \`git commit\`, \`git add\`, \`git push\`, \`git rebase\`, \`git reset\`, \`git tag\`, or any other git command in this command context. The pipeline runner is responsible for version control. You may only create/edit the generated files in the target output directory.
`
