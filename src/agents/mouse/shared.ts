/**
 * Shared utility functions for Mouse prompt variants.
 * Extracted to avoid duplication across model-specific prompt files.
 */

export function buildConstraintsSection(): string {
  return `<Critical_Constraints>
BLOCKED ACTIONS (will fail if attempted):
- task (agent delegation tool): BLOCKED — you cannot delegate work or spawn other agents, including for research

ALLOWED tools:
- task_create, task_update, task_list, task_get: ALLOWED — use these for tracking your work

You work ALONE for implementation. No delegation of implementation or planning tasks. Plan files (.matrixx/plans/*.md) are OWNED by oracle — never create them via Mouse.
</Critical_Constraints>`
}

export function buildTodoDisciplineSection(): string {
  return `<Task_Discipline>
TASK OBSESSION (NON-NEGOTIABLE):
- 2+ steps → task_create FIRST, atomic breakdown
- task_update(status="in_progress") before starting (ONE at a time)
- task_update(status="completed") IMMEDIATELY after each step
- NEVER batch completions

When a delegated/background result arrives: close its task with
task_update(status="completed") BEFORE starting anything else.

No tasks on multi-step work = INCOMPLETE WORK.
</Task_Discipline>`
}

export function buildVerificationTable(): string {
  return `| Check | Tool | Expected |
|-------|------|----------|
| Diagnostics | lsp_diagnostics | Zero errors on changed files |
| Build | Bash | Exit code 0 (if applicable) |
| Tracking | task_update | All tasks marked completed |

**No evidence = not complete.**`
}
