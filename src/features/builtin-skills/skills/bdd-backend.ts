import type { BuiltinSkill } from "../types"

export const BDD_BACKEND_SKILL_NAME = "bdd-backend"

const BDD_BACKEND_SKILL_DESCRIPTION =
  "Typed API service generation from BDD Contract JSON. Use when generating backend services for a feature."

export const bddBackendSkill: BuiltinSkill = {
  name: BDD_BACKEND_SKILL_NAME,
  description: BDD_BACKEND_SKILL_DESCRIPTION + ' NEVER commits or runs git in this skill context.',
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
7. **Generate \`*.test.ts\` for every service module** (see Unit Tests section below) -- one file per service, co-located next to it (e.g. \`auth.service.ts\` -> \`auth.service.test.ts\`)
8. **Run the generated unit tests** as the final step (see Running Unit Tests section below). Up to 3 retry attempts on failure. Do not declare success until all unit tests pass.

## API Service Structure
- Request types inferred from \`annotations.api.endpoints[].request\`
- Response types from \`annotations.api.responses[]\` (\`status\` + \`format\`)
- Zod schemas for runtime validation
- Error handling with typed error responses
- Single file per feature endpoint group

## Unit Tests (REQUIRED output)
Every generated service module MUST ship with a co-located \`*.test.ts\` that exercises its real behaviour. The test file uses \`bun:test\` as the runner -- no other test framework needed. Mock the HTTP transport (\`globalThis.fetch\` with \`bun:test\`'s \`mock()\`) so the tests run in milliseconds without network.

Scope per service:
- **Zod schema validation**: for each request and response schema, assert that a valid payload parses successfully and that each invalid variant (missing field, wrong type, out-of-range value) returns a \`ZodError\` with a helpful \`issues\` array.
- **Service function call**: invoke each service function with a representative request and assert that \`fetch\` was called exactly once with the right \`method\` (from the contract's \`api.endpoints[].method\`, exactly matching the enum), the right \`url\` (from \`api.endpoints[].path\`, including any path interpolation), the right \`headers\` (Content-Type: application/json), and the right \`body\` (JSON-stringified request).
- **Response handling**: assert that a 2xx response with the documented \`api.responses[].format\` returns a parsed value; assert that a 4xx/5xx response throws a typed error whose message includes the status code.
- **Error handling**: assert that a network error (fetch rejects) is caught and rethrown as a typed error; assert that a malformed JSON response (Content-Type says json but body is not) is also handled gracefully.

Use the contract's \`api.endpoints[]\` and \`api.responses[]\` as the test plan -- each endpoint gets at least one happy-path test and at least one error-path test.

## Running Unit Tests (MANDATORY final step)
After all service modules and tests are generated, run the unit tests:
\`\`\`bash
bun test backend/
\`\`\`
If a test fails, read the failure, fix the service (or the test if the test is wrong), and re-run. Up to **3 retry attempts**. If still failing after 3 attempts, report the failure with the test output and the list of files that need attention. Do not declare success until all unit tests pass.

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

## Git Actions (HARD RULE)
NEVER run \`git commit\`, \`git add\`, \`git push\`, \`git rebase\`, \`git reset\`, \`git tag\`, or any other git command in this skill context. The pipeline runner is responsible for version control. You may only create/edit the generated files in the target output directory.`,
}
