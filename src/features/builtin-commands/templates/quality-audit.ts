export const QUALITY_AUDIT_TEMPLATE = `You are running a read-only deterministic quality audit (v1 advisory-only).

## Usage

\`\`\`
/quality-audit [--scope=file|module|project] [--target=<path>]
\`\`\`

- --scope: file | module | project (default: project).
  - file: single --target path only.
  - module: the directory containing --target.
  - project: full tree.
- --target: path scoping the audit. Optional for project scope; required for file and module scope.
- Diff-scoped fast path: when the working tree has uncommitted changes, restrict
  gathering to changed files first (UNVERIFIED CLAIM: exact git-diff refspec
  origin/dev...HEAD vs staged is unverified — use whatever diff the session
  provides and record which refspec was used as evidence).
- Invalid --scope value is a hard error: \`error: invalid --scope '<v>'
  (expected file|module|project)\`, exit 2, no report written.
- Typo rule: /qualiti-assurance is a typo, no alias. Any unknown /quality-*
  variant is an error, never an alias or auto-correction.
- v1 advisory-only: this command never fails the build, never gates CI, only
  reports. Exit-code mapping 0/1/2 reserved: 0 = pass, 1 = warnings, 2 = errors.

## WHAT TO DO, IN THIS ORDER

1. **Resolve the scope, or stop.** Parse --scope and --target from
   <user-request>. Resolve --target against the working tree. If the target is
   unresolvable (missing path, invalid --scope value, file or module scope
   without a target), ERROR AND STOP: state the scope, the target, and why resolution
   failed, and create no report file. Never proceed on an empty or partial
   resolution, and never substitute a different target.

2. **Gather the deterministic read-only inputs.** All gathering is read-only;
   run nothing that mutates source. Collect, in this order:
   - \`tsc --noEmit\` (typecheck) on the scope.
   - \`biome check src/\` (lint, src-only).
   - \`bun test\` with mock-heavy isolation per script/run-ci.sh
     (isolated runs for mock-heavy entries listed in script/mock-heavy-list.txt,
     then the catch-all exclusion).
   - silent-failure-scanner on the scope (tool: silent_failure_scan).
     If the scope provides a committed waiver file, pass it as \`waivers\` (never invent a waiver path; never accept one under gitignored \`.matrixx/\`).
   - Conditional validators, ONLY when the scope touches those domains:
     dashboard-flux-validator for Grafana/Flux dashboards,
     market-symbol-validator for market-symbol code,
     staleness-gap-checker for market-data feed samples.
     Skip inapplicable validators as N/A (see threshold table).
   - lsp_diagnostics (read-only) for files in scope as corroborating evidence.
   Record each tool's raw exit code and output as evidence.

3. **Compute the DETERMINISTIC grade from exit codes only.** The grade is a pure
   function of per-dimension exit codes and warning/error counts. No model
   judgment enters the grade. The silent-failures dimension uses the filtered
   exit code (after waivers).

   Per-dimension mapping (threshold rule per dimension):
   - exit 0 → pass
   - exit 1 → warn
   - exit 2 → fail
   - N/A → status N/A + exitCode null, excluded from grade computation
     (does not count toward warning/error tallies).

   Grade threshold table (fixed numbers, no approximations):

   | Condition | Grade |
   |-----------|-------|
   | all dimensions exit 0 with 0 errors + 0 warnings | A |
   | any dimension exit 1 with 0 exit-2, and warning-dimensions <= 1 | B |
   | any dimension exit 1 with 0 exit-2, and warning-dimensions >= 2 | C |
   | any dimension exit 2 with exactly 1 error-dimension | D |
   | any dimension exit 2 with >= 2 error-dimensions | F |

   Rules:
   - N/A dimensions carry status N/A and exitCode null and are excluded from
     grade computation entirely.
   - Dimensions evaluated: typecheck, lint, tests, silent-failures,
     flux (conditional), market-symbols (conditional), staleness (conditional),
     diagnostics (corroborating).
   - Sentinel, tank, and neo prose goes to an advisory appendix and MUST NOT
     change the grade. The grade derives from tool exit codes only.

4. **Delegate the ADVISORY dimensions to sentinel, tank, and neo.** These agents
   supply prose only (architecture notes from sentinel, adversarial notes from
   tank, exploratory notes from neo) for the advisory appendix. Their output is
   never a grade input and MUST NOT change the grade. They must never write the
   report and never touch source.

5. **Render and write the report.** Run \`mkdir -p .matrixx/quality\` in bash
   first, then write \`.matrixx/quality/<scope>-<timestamp>.md\` and the
   same-basename \`.json\` sidecar together. \`generatedAt\`/timestamp is a
   caller-supplied input — never self-generate it. Report JSON keys: grade
   (A-F), perDimension (one entry per rubric dimension with status + exitCode +
   evidence), exitCodes map, scope, timestamp/generatedAt (caller-supplied),
   targetGrade (assurance only), iterations (assurance only). The silent-failures
   entry MUST also record \`waiverFile\` (or null) plus \`waived\` and \`stale\` counts.
   Never touch

6. **Report the paths back to the user.** Give the absolute report path and the
   sidecar path plus the grade and per-dimension exit codes. Do not modify any
   plan.

## FORBID LIST — hard denials inside this audit

- NO Edit/Write to source files.
- NO lsp_rename.
- NO non-dryRun ast_grep_replace (dryRun preview reads are allowed; applying is denied).
- NO task_create / NO task_update.
- NO plan_update and never touch .matrixx/plans.
- Writes = report+sidecar only: the ONLY writable paths are
  .matrixx/quality/<scope>-<timestamp>.md plus its same-basename .json sidecar
  (after mkdir -p .matrixx/quality). No staging, no network, no other writes.

<user-request>
$ARGUMENTS
</user-request>`
