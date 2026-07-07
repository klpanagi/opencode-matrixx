export const BDD_TESTS_TEMPLATE = `# /bdd-tests

Generate Cucumber step definitions and page objects from one or more BDD Contract JSON files.

## Usage

Single file:
\`\`\`
/bdd-tests <contract.json> --out <out-dir>
\`\`\`

Batch (directory or glob):
\`\`\`
/bdd-tests <dir> --out <out-dir>
/bdd-tests "<dir>/**/*.contract.json" --out <out-dir>
\`\`\`

## Workflow

Single file:
1. Read the Contract JSON file
2. Extract feature scenarios and their steps
3. Generate Cucumber step definition files (Given/When/Then/And/But)
4. Generate page object classes for UI interactions
5. Generate \`cucumber.cjs\` (CommonJS, NOT \`cucumber.js\`) + a per-feature \`Dockerfile\` + \`run-tests.sh\` so the tests are runnable in CI and locally
6. Verify with \`npx cucumber-js\` via bash (use the generated \`run-tests.sh\` if it exists, else invoke cucumber directly)

Batch input (directory or glob):
1. Expand the input into a list of .contract.json files
2. For each contract, run the single-file workflow above (including the Dockerfile + run-tests.sh generation)
3. Use background subagents (\`task(run_in_background=true)\`) to run each in parallel (up to 5 concurrent)
4. Wait for all to finish, then collect results and report a summary

## Output

Single file: \`<out-dir>/<feature>/\` containing \`cucumber.cjs\`, \`Dockerfile\`, \`run-tests.sh\`, plus \`tests/\` (step definitions, page objects, world, hooks).

Batch: per-feature subdirectory tree under \`<out-dir>/<feature>/\` with the same layout for each feature.
`
