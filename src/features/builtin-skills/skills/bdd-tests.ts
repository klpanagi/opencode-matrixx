import type { BuiltinSkill } from "../types"

export const BDD_TESTS_SKILL_NAME = "bdd-tests"

const BDD_TESTS_SKILL_DESCRIPTION =
  "Cucumber step definition + page object generation from BDD Contract JSON. Use when generating E2E tests for a feature."

export const bddTestsSkill: BuiltinSkill = {
  name: BDD_TESTS_SKILL_NAME,
  description: BDD_TESTS_SKILL_DESCRIPTION,
  template: `# BDD Test Generation

## Overview
Generate Cucumber step definitions and page objects from a BDD Contract JSON.

## Workflow
1. Read the Contract JSON file
2. Extract feature scenarios and their steps
3. Generate step definition files for each scenario
4. Generate page object classes for UI interactions
5. Generate a Cucumber configuration file if needed
6. Verify with \`npx cucumber-js\`

## Step Definition Structure
- Given: Setup preconditions and state
- When: Perform actions via page objects
- Then: Assert expected outcomes
- And/But: Additional conditions in sequence

## Page Object Model
- One class per screen/page
- Locators as class properties
- Methods representing user actions
- Return \`this\` for method chaining

## Data Table Handling
- Convert tables to arrays of maps
- Use in scenario outlines with Examples tables

## Running Tests
\`\`\`bash
npx cucumber-js path/to/features --require path/to/step-definitions
\`\`\`

## Cucumber Configuration
- **File name**: Use \`cucumber.cjs\` (not \`cucumber.js\`) when the project's \`package.json\` has \`"type": "module"\` -- otherwise Node will treat the CommonJS file as ESM and fail with \`module is not defined\`.
- **Step definition loading**: \`require: ['tests/**/*.ts', 'tests/**/*.steps.ts']\` to load page objects, world, hooks, and step files together. Use \`tests/**/*.{ts,steps.ts}\` or two globs -- do NOT use \`*.steps.ts\` alone (it misses the supporting files).
- **TypeScript loader**: Add \`{ module: ['tsx/esm'] }\` to \`requireModule\` so \`tsx\` transpiles \`.ts\` files on import.
- **World baseURL**: The generated \`world.ts\` MUST set \`baseURL: process.env.BDD_BASE_URL || 'http://localhost:4000'\` in \`browser.newContext()\` so \`page.goto('/login')\` resolves against the local preview server. Without it, the relative navigation 404s.

## Containerized Test Runner (REQUIRED output)
Every generated feature MUST ship with a \`Dockerfile\` and a \`run-tests.sh\` next to \`cucumber.cjs\` -- these are what makes the BDD tests actually runnable in CI and on developer machines. Skipping them is a pipeline failure.

### run-tests.sh (local)
Spawns the feature's \`components/preview-server.ts\` in the background, waits for it to be reachable on \`http://localhost:\${PREVIEW_PORT:-4000}\`, then runs \`npx cucumber-js\` against the feature dir, then kills the server on exit. Implementation requirements:
- \`set -euo pipefail\` at the top.
- Compute \`SCRIPT_DIR\` from \`\${BASH_SOURCE[0]}\` so the script is location-independent.
- \`trap cleanup EXIT INT TERM\` to guarantee the preview server is killed even on cucumber failure.
- Health-check loop: \`curl -fsS http://localhost:$PORT/login\` for up to 30s before giving up.
- Forward all script args (\`"$@"\`) and \`\${BDD_ARGS:-}\` to cucumber-js so users can pass \`--tags @happy-path\` etc.
- Make the file executable (\`chmod +x\`).

### Dockerfile (containerised)
Per-feature \`Dockerfile\` with the repo root as build context. Implementation requirements:
- Base: \`oven/bun:1.3.6\` (matches matrixx devDeps).
- \`apt-get install\` the Playwright chromium runtime libs (libnss3, libgbm1, libgtk-3-0, etc.) -- see https://playwright.dev/docs/docker for the canonical list. \`rm -rf /var/lib/apt/lists/*\` at the end.
- \`COPY package.json bun.lock* ./\` then \`bun install --frozen-lockfile\` (idempotent, fast).
- \`bunx playwright install chromium\` (downloads the browser binary at build time).
- \`COPY demos/bdd ./demos/bdd\` and \`COPY src/features/bdd ./src/features/bdd\` -- only the test runtime, nothing else.
- \`chmod +x\` the \`run-tests.sh\`.
- \`ENV BDD_BASE_URL=http://localhost:4000\` and \`ENV PREVIEW_PORT=4000\` as defaults.
- \`WORKDIR /app/demos/bdd/<feature>\` and \`CMD ["bash", "run-tests.sh"]\`.

### .dockerignore (repo root)
The build context is the repo root, so the \`.dockerignore\` lives at the repo root and applies to every per-feature \`docker build\`. Must exclude: \`.git\`, \`node_modules\`, \`dist\`, \`coverage\`, \`reports\`, \`*.log\`, \`bun.lockb\`, \`.matrixx/\`, \`docs/\`, \`*.md\` (except the per-feature \`Dockerfile\`, \`run-tests.sh\`, and \`demos/bdd/README.md\`).
`,
}
