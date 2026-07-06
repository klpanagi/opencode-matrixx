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
2. Extract \`@api:*\` annotations
3. For each \`@api:endpoint METHOD /path\`, create a service function
4. For each \`@api:response STATUS\`, define a typed response
5. Use Zod schemas for request/response validation
6. Generate a service class or module file

## API Service Structure
- Request types inferred from endpoint annotations
- Response types from \`@api:response\` annotations
- Zod schemas for runtime validation
- Error handling with typed error responses
- Single file per feature endpoint group

## Example Pattern
\`\`\`typescript
import { z } from "zod"

export const LoginRequest = z.object({ email: z.string().email(), password: z.string().min(8) })
export type LoginRequest = z.infer<typeof LoginRequest>

export async function login(data: LoginRequest): Promise<LoginResponse> {
  // Implementation
}
\`\`\``,
}
