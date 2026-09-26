import type { BuiltinSkill } from "../types"

export const BDD_TESTS_SKILL_NAME = "bdd-tests"

const BDD_TESTS_SKILL_DESCRIPTION =
  "Use when generating Cucumber E2E tests from BDD contracts, creating page objects, or setting up test runners with Docker — generates Cucumber step definitions, page object classes, Dockerfile, and run-tests.sh from BDD Contract JSON. Related: bdd-contract, bdd-backend, playwright."

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
6. **Run the generated cucumber suite** as the final step (see Running Tests section below). Up to 3 retry attempts on failure. Do not declare success until all scenarios pass.

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


## Running Tests (MANDATORY final step)
After all step definitions, page objects, and \`cucumber.cjs\` are generated, run the cucumber suite. The generated per-feature \`run-tests.sh\` is the canonical entry point -- it starts the preview server, waits for it, runs cucumber, and cleans up on exit:
\`\`\`bash
bash <feature-dir>/run-tests.sh
\`\`\`
If the \`run-tests.sh\` is not yet generated (older flow), invoke cucumber directly:
\`\`\`bash
npx cucumber-js <feature-dir> --require <feature-dir>/tests/**/*.ts --require <feature-dir>/tests/**/*.steps.ts --require-module tsx/esm
\`\`\`
If a scenario fails, read the failure output, fix the step definition (or the page object, or the preview server mock), and re-run. Up to **3 retry attempts**. If still failing after 3 attempts, report the failure with the cucumber output and the list of files that need attention. Do not declare success until all scenarios pass.

## Cucumber Configuration
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
- Health-check loop: \`curl -fsS http://localhost:$PORT/\` for up to 30s before giving up. (Probe the index/root path -- the generated \`preview-server.ts\` always serves \`/\`, but per-feature route paths like \`/login\` may not be wired and will return 404.)
- Forward all script args (\`"$@"\`) and \`\${BDD_ARGS:-}\` to cucumber-js so users can pass \`--tags @happy-path\` etc.
- Make the file executable (\`chmod +x\`).
- **CRITICAL pitfall**: do NOT spawn the preview server inside a subshell with \`( cd "$FEATURE_DIR" && PORT=... bun "$PREVIEW_SERVER" >log 2>&1 & )\`. The \`&\` inside the subshell means the job never enters the parent shell job table, so \`PREVIEW_PID=$!\` in the parent is unbound and the script crashes with \`$!: unbound variable\` under \`set -u\`. Use \`pushd "$FEATURE_DIR" >/dev/null; PORT=... bun "$PREVIEW_SERVER" >log 2>&1 &; PREVIEW_PID=$!; popd >/dev/null\` instead.


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

### Batch Mode (REQUIRED when input is a directory of multiple features)
When the bdd-tests input is a directory or a glob of multiple contracts (not a single file), AFTER the per-feature generation above, ALSO emit two parent-shared files at the **input directory root** so the entire suite can be run with one command. These are NOT optional:

- **\`<input-dir>/run-tests.sh\`** -- iterates every immediate subdirectory of \`<input-dir>\` that has a \`run-tests.sh\`, invokes each in sequence, and prints a \`N passed, M failed\` summary at the end. A failure in one feature MUST NOT abort the loop. The parent reads the same env vars as the per-feature runner (\`BDD_FEATURE\` to filter to a single subdir, \`BDD_ARGS\` to forward extra cucumber args). Implementation: \`set -uo pipefail\` (NOT \`-e\` so one bad feature does not stop the rest), \`shopt -s nullglob\`, \`[[ ! -f "$runner" ]] && continue\` to skip subdirs without a generated runner. Make the file executable.


## Git Actions (HARD RULE)
NEVER run \`git commit\`, \`git add\`, \`git push\`, \`git rebase\`, \`git reset\`, \`git tag\`, or any other git command in this skill context. The pipeline runner is responsible for version control. You may only create/edit the generated files in the target output directory.`,
}
