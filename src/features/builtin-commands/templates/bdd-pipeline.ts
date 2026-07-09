export const BDD_PIPELINE_TEMPLATE = `# /bdd-pipeline

Full BDD pipeline: parse one or more .feature files, generate a Contract, run
the 3 parallel subagents (tests, frontend, backend), and write a per-feature
ANALYSIS.md. The pipeline is implemented as a tool — same input produces the
same task shape every run.

## Usage

\`\`\`
/bdd-pipeline <feature-path|dir|glob> --out <out-dir> [--force]
\`\`\`

Examples:
- Single file: \`/bdd-pipeline features/auth/login.feature --out ./generated\`
- Directory: \`/bdd-pipeline features/auth --out ./generated\`
- Glob: \`/bdd-pipeline "features/**/*.feature" --out ./generated\`

## What to do

1. Call the \`bdd_pipeline_run\` tool with the resolved inputs:

   \`\`\`json
   {
     "featurePaths": ["<absolute path(s) or glob(s)>"],
     "outDir": "<absolute output dir>",
     "force": false
   }
   \`\`\`

   The tool returns \`{ success, count, passed, failed, results[] }\`. Each
   \`result\` contains \`status\`, per-stage \`tests_passed\`/\`tests_failed\`,
   \`filesCreated\`, \`missingOutputs\`, and \`error\`.

2. Report the aggregated result. PASS means every feature has \`status: "PASS"\`
   (all 3 subagent stages completed + the file-existence gate passed). FAIL
   otherwise — list the failing features, failing stages, and missing outputs.

3. Do NOT spawn subagents, parse .feature files, generate components, or write
   ANALYSIS.md yourself — the tool does all of that.

4. Do NOT run any git commands (commit, add, push, rebase, etc.).
`
