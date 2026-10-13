export const QUALITY_ASSURANCE_TEMPLATE = `# Quality Assurance Command

## Usage

\`\`\`
/quality-assurance [--scope=file|module|project] [--target-grade=B] [--max-iterations=3] [--target=<path>]
\`\`\`

Defaults: --scope=module, --target-grade=B, --max-iterations=3.

Arguments:
  --scope: Assurance scope (default: module)
    - file: Single file only (requires --target=<path>)
    - module: Module/directory scope (default)
    - project: Entire codebase
  --target-grade: Grade to reach before stopping (default: B). Grades A-F.
  --max-iterations: Bounded loop cap (default: 3). Values >3 require an explicit user flag.
  --target: Path restricting edits when --scope=file (or a module path when --scope=module).

This loop is BOUNDED with a fixed cap. It never loops without a bound and never chases perfection without a cap.

## Protocol Loop (fixed order, bounded)

Run these steps in this exact order per iteration:

1. **Baseline.** Run /quality-audit for the current --scope/--target. Keep the
   baseline report path. The baseline grade, perDimension (each: status +
   exitCode + evidence), exitCodes map, scope, timestamp/generatedAt
   (caller-supplied, never self-generated), targetGrade, and iterations fields
   form the only input the rest of the iteration may use.
2. **Oracle delta-plan.** Consult the oracle agent for a minimal fix list derived
   from the baseline report ONLY. No new scope, no new dimensions, no fresh
   exploration beyond the baseline evidence. Read-only step.
3. **Smith gate.** Pass the oracle delta-plan through the smith gate per the
   plan-review doctrine BEFORE any edits: admission check first, then approval.
   Blocked plans stop the iteration with no edits. Read-only step.
4. **TDD implement.** TDD RED-GREEN-REFACTOR semantics ALWAYS, per tdd-enforcer:
   RED (write a failing test first), GREEN (minimum code to pass), REFACTOR
   (clean up, tests stay green). The main session writes the tests itself; never
   delegate test authorship. This is the ONLY step that MAY Edit/Write source
   files, strictly within --scope/--target only. Verify after each change
   (lsp_diagnostics clean, tests pass) before proceeding.
5. **Verify.** Re-run /quality-audit on the same --scope/--target and compare
   grades (new grade vs old grade). Write the iteration report (see below) with
   iterations incremented.

## Stop Conditions (any one stops the loop)

- Grade >= target: the verify grade meets or exceeds --target-grade.
- Zero-delta: new grade == old grade with no new fixes remaining.
- Iteration cap reached: iterations == --max-iterations (default 3).

When any stop condition fires, stop immediately. Then run the auditor
post-review: the auditor agent gives a read-only advisory verdict on the final
report. Advisory only — it never edits, never retries, never rejects.

## Report Contract (same as audit)

Each iteration writes \`.matrixx/quality/<scope>-<timestamp>.md\` + the \`.json\`
sidecar together (timestamp caller-supplied, unique per run, last-write-wins).
The JSON carries grade (A-F), perDimension (each: status + exitCode +
evidence), exitCodes map, scope, timestamp/generatedAt (caller-supplied),
targetGrade, and iterations (incremented each iteration). Exits: 0=pass /
1=warnings / 2=errors. v1 is advisory-only: a low grade never halts, retries,
or rejects. Never write to \`.matrixx/plans/\`; never open or mutate a plan file.

## Forbid-List

Identical to the audit forbid-list EXCEPT the TDD-implement step MAY Edit/Write
source files strictly within --scope/--target only:

- All other steps (baseline, oracle delta-plan, smith gate, verify, auditor
  post-review) are read-only: NO Edit/Write to source, NO lsp_rename, NO
  non-dryRun ast_grep_replace, NO task_create/task_update, NO plan_update.
- Report writes are report + sidecar only.
- Per-iteration wall-clock timeout 300 (5 min). Exceeding the timeout stops the
  iteration and records the timeout in the report.
- No scope expansion mid-loop: --scope/--target are fixed when the loop starts.
- No --max-iterations value >3 without an explicit user flag.
- No auto-PR, no merge, no master push, no new agents/tools/skills.

## Critical

- The loop is bounded with default 3. There is no unbounded mode.
- Low grades are ADVISORY. Nothing here auto-merges or publishes.

<user-request>
$ARGUMENTS
</user-request>
`
