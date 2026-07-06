export const BDD_BACKEND_TEMPLATE = `# /bdd-backend

Generate typed API services from a BDD Contract JSON.

## Usage
\`\`\`
/bdd-backend <contract.json>
\`\`\`

## Workflow
1. Read the Contract JSON
2. Extract @api:endpoint and @api:response annotations
3. Generate typed service files with Zod request/response schemas
4. One service function per endpoint
5. Report generated file paths

## Output
TypeScript service files (.ts) with Zod validation schemas for each API endpoint.`
