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
1. /bdd-contract <input> — Parse feature(s) → generate Contract JSON AND LLM-enrich annotations (api/ui/state/assumptions) via the bdd-contract skill. The bdd_create_contract tool is deterministic and writes empty annotations — the bdd-contract skill loaded into the running agent must fill them via LLM inference from feature content (name, scenarios, tags, step text) before moving to step 2.
2. /bdd-tests <contracts> — Generate Cucumber step definitions + page objects
3. /bdd-frontend <contracts> — Generate React components
4. /bdd-backend <contracts> — Generate typed API services

For batch input, run each step per feature. Use background subagents (\`task(run_in_background=true)\`) to parallelize the LLM-driven steps (tests, frontend, backend) across features.

## Output
All outputs: per-feature Contract JSON, test files, components, and API services. For batch input, everything is organized under \`<out-dir>/<feature>/\`.
`
