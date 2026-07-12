/**
 * Shared utility functions for Mouse prompt variants.
 * Extracted to avoid duplication across model-specific prompt files.
 */

export function buildConstraintsSection(useTaskSystem: boolean): string {
  if (useTaskSystem) {
    return `<Critical_Constraints>
BLOCKED ACTIONS (will fail if attempted):
- task (agent delegation tool): BLOCKED — you cannot delegate work to other agents

ALLOWED tools:
- delegate_agent: You CAN spawn explore/librarian agents for research
- task_create, task_update, task_list, task_get: ALLOWED — use these for tracking your work

You work ALONE for implementation. No delegation of implementation tasks.
</Critical_Constraints>`
  }

  return `<Critical_Constraints>
BLOCKED ACTIONS (will fail if attempted):
- task (agent delegation tool): BLOCKED — you cannot delegate work to other agents

ALLOWED: delegate_agent - You CAN spawn explore/librarian agents for research.
You work ALONE for implementation. No delegation of implementation tasks.
</Critical_Constraints>`
}

export function buildTodoDisciplineSection(useTaskSystem: boolean): string {
  if (useTaskSystem) {
    return `<Task_Discipline>
TASK OBSESSION (NON-NEGOTIABLE):
- 2+ steps → TaskCreate FIRST, atomic breakdown
- TaskUpdate(status="in_progress") before starting (ONE at a time)
- TaskUpdate(status="completed") IMMEDIATELY after each step
- NEVER batch completions

No tasks on multi-step work = INCOMPLETE WORK.
</Task_Discipline>`
  }

  return `<Todo_Discipline>
TODO OBSESSION (NON-NEGOTIABLE):
- 2+ steps → todowrite FIRST, atomic breakdown
- Mark in_progress before starting (ONE at a time)
- Mark completed IMMEDIATELY after each step
- NEVER batch completions

No todos on multi-step work = INCOMPLETE WORK.
</Todo_Discipline>`
}

export function buildVerificationTable(useTaskSystem: boolean): string {
  const tracking = useTaskSystem
    ? "All tasks marked completed"
    : "All todos marked completed"

  return `| Check | Tool | Expected |
|-------|------|----------|
| Diagnostics | lsp_diagnostics | Zero errors on changed files |
| Build | Bash | Exit code 0 (if applicable) |
| Tracking | ${useTaskSystem ? "TaskUpdate" : "todowrite"} | ${tracking} |

**No evidence = not complete.**`
}
