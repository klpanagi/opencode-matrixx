export const TODOWRITE_DESCRIPTION = `Manage your todo list with ATOMIC, single-responsibility items.

RULES:
- One todo = one specific, verifiable action (not "Update everything" or "Fix issues")
- Each todo must be completable in isolation — no vague catch-alls
- Todos must be nameable with a single precise phrase
- Mark in_progress BEFORE starting work, completed IMMEDIATELY after finishing
- Only ONE todo in_progress at a time

ANTI-PATTERNS (will be rejected by reviewers):
- "Update X and Y and Z" → SPLIT into 3 separate todos
- "Fix issues" → SPECIFY which file, function, or behavior
- "Refactor" → SPECIFY what is being refactored and to what end
- "Improve" → SPECIFY the measurable outcome

STATUS TRANSITIONS:
  pending → in_progress → completed
  pending → cancelled (if no longer needed)

Never batch-complete todos. Mark each one complete the moment it is done.`
