export const BDD_PIPELINE_TEMPLATE = `# /bdd-pipeline

Full BDD pipeline: generate contract, tests, frontend, and backend from one or more .feature files.

## Usage

Single file:
\`\`\`
/bdd-pipeline <feature-path> [--force]
\`\`\`

Batch (directory or glob):
\`\`\`
/bdd-pipeline <dir> --out <out-dir> [--force]
/bdd-pipeline "<dir>/**/*.feature" --out <out-dir> [--force]
\`\`\`

## Pipeline Steps
1. /bdd-contract <input> -- Parse feature(s) -> generate Contract JSON AND LLM-enrich annotations (api/ui/state/assumptions) via the bdd-contract skill. The bdd_create_contract tool is deterministic and writes empty annotations; the bdd-contract skill loaded into the running agent must fill them via LLM inference from feature content (name, scenarios, tags, step text) before moving to step 2.
2. **Run bdd-tests, bdd-frontend, and bdd-backend in parallel** as 3 background subagents (\`task(run_in_background=true)\`). Each subagent has a contract JSON as input and:
   - generates its respective artefacts (step defs + page objects + cucumber.cjs + Dockerfile + run-tests.sh | React components + *.test.tsx + preview-server.ts | typed Zod API service + *.test.ts)
   - runs its own test suite as the FINAL step of its work (3 retries on failure, then report)
   - returns a structured { stage, files_created, tests_passed, tests_failed, test_output } report
   Each stage is independent -- no shared state between the three subagents.

## Aggregation
When the 3 subagents return, aggregate:
- **PASS** if all 3 stages report tests_passed == tests_total
- **FAIL** otherwise, with a per-stage breakdown: which stage(s) failed, how many tests failed, and the first 50 lines of the failing test output per stage
Report the aggregated result in the pipeline's final response. Do NOT mark the pipeline as successful if any of the 3 stages failed.

For batch input (multiple .feature files), iterate the contract phase per file (deterministic + fast), then for each contract spawn the 3 parallel subagents above. Subagents across different features can themselves run in parallel up to 5 concurrent.

## Output
All outputs: per-feature Contract JSON, test files, components, and API services. For batch input, everything is organized under \`<out-dir>/<feature>/\`.

## Git Actions (HARD RULE)
NEVER run \`git commit\`, \`git add\`, \`git push\`, \`git rebase\`, \`git reset\`, \`git tag\`, or any other git command in this pipeline context. The pipeline runner is responsible for version control. You may only create/edit the generated files in the target output directory. If subagents try to commit, REFUSE.
`
