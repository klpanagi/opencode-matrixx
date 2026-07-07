import type { BuiltinSkill } from "../types"

export const BDD_BACKEND_SKILL_NAME = "bdd-backend"

const BDD_BACKEND_SKILL_DESCRIPTION =
  "Typed API service generation from BDD Contract JSON. Use when generating backend services for a feature."

export const bddBackendSkill: BuiltinSkill = {
  name: BDD_BACKEND_SKILL_NAME,
  description: BDD_BACKEND_SKILL_DESCRIPTION,
  template: `# BDD Backend Generation

## Overview
Generate typed API services from BDD Contract JSON annotations.

## Workflow
1. Read the Contract JSON
2. Read the contract's \`annotations.api\` block (\`endpoints[]\` + \`responses[]\`)
3. For each \`endpoints[]\` entry (\`{ method, path, request?, response?, description? }\`), create a service function
4. For each \`responses[]\` entry (\`{ status, format, description? }\`), define a typed response shape
5. Use Zod schemas for request/response validation
6. Generate a service class or module file

## API Service Structure
- Request types inferred from \`annotations.api.endpoints[].request\`
- Response types from \`annotations.api.responses[]\` (\`status\` + \`format\`)
- Zod schemas for runtime validation
- Error handling with typed error responses
- Single file per feature endpoint group

## Batch Mode
When the input is a directory or glob of .contract.json files:
1. Expand the input into a list of contract files
2. For each contract, run the single-file workflow above
3. Use \`task(run_in_background=true)\` to spawn parallel subagents (up to 5 concurrent) for each contract
4. Collect all results and report a per-feature summary
5. Output structure: \`<out-dir>/<feature>/backend/\` with one service module per feature

## Example Pattern
\`\`\`typescript
import { z } from "zod"

export const LoginRequest = z.object({ email: z.string().email(), password: z.string().min(8) })
export type LoginRequest = z.infer<typeof LoginRequest>

export async function login(data: LoginRequest): Promise<LoginResponse> {
  // Implementation
}
\`\`\``
}
