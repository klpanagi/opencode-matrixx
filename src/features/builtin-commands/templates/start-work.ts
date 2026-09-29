export const START_WORK_TEMPLATE = `You are starting a Morpheus work session.

## WHAT TO DO

1. **Find available plans**: List Oracle-generated plan files via plan_list at \`.matrixx/plans/\`; each entry carries a progress field (total, completed, remaining, isComplete). A plan reported as \`degraded\` by plan_tasks is over the read cap — it is still fully workable through the section reads in step 5

2. **Check for active mission state**: Read \`.matrixx/mission.json\` if it exists

3. **Decision logic**:
   - If \`.matrixx/mission.json\` exists AND plan is NOT complete (has unchecked boxes):
     - **APPEND** current session to session_ids
     - Continue work on existing plan
   - If no active plan OR plan is complete:
     - List available plan files via plan_list
     - If ONE plan: auto-select it
     - If MULTIPLE plans: show list with timestamps, ask user to select

4. **Create/Update mission.json**:
   \`\`\`json
   {
     "active_plan": "/absolute/path/to/plan.md",
     "started_at": "ISO_TIMESTAMP",
     "session_ids": ["session_id_1", "session_id_2"],
     "plan_name": "plan-name"
   }
   \`\`\`

5. **Read the plan**:
   - Call plan_tasks for the task manifest and progress. On an over-cap plan it degrades — it returns the manifest with a \`degraded\` marker instead of failing
   - Read the body with plan_read, **section selector FIRST**:
     - \`section\`: a section id (e.g. \`tl-dr\`, \`context\`, \`work-objectives\`, \`verification-strategy-mandatory\`, \`execution-strategy\`, \`todos\`, \`commit-strategy\`, \`success-criteria\`) or the kebab id derived from any custom heading. Returns ONLY that section's span plus its metadata (id, level, startLine, endLine, bytes, contentHash). Add \`sectionIndex\` (0-based) when the heading occurs more than once — a missing or out-of-range index is a validation_error, not a silent first match
     - \`section\` WINS over \`offset\`/\`limit\`; when both are supplied the response reports \`precedence:"section"\` with the effective absolute startLine/endLine
     - Fall back to reading via paginated plan_read (offset/limit) for spans a section does not cover
   - The size cap is a ceiling, not a wall: it refuses only an unbounded WHOLE-FILE read (\`file_too_large\`). Supplying \`offset\`/\`limit\` or a \`section\` reads past it, at any file size
   - If a window comes back \`clamped\`, the \`hint\` names the effective window — re-read that window instead of retrying the same one. A \`read_failed\` error is a permissions problem; pagination cannot recover from it

## OUTPUT FORMAT

When listing plans for selection:
\`\`\`
Available Work Plans

Current Time: {ISO timestamp}
Session ID: {current session id}

1. [plan-name-1.md] - Modified: {date} - Progress: {completed}/{total} tasks
2. [plan-name-2.md] - Modified: {date} - Progress: {completed}/{total} tasks

Which plan would you like to work on? (Enter number or plan name)
\`\`\`

When resuming existing work:
\`\`\`
Resuming Work Session

Active Plan: {plan-name}
Progress: {completed}/{total} tasks
Sessions: {count} (appending current session)

Reading plan and continuing from last incomplete task...
\`\`\`

When auto-selecting single plan:
\`\`\`
Starting Work Session

Plan: {plan-name}
Session ID: {session_id}
Started: {timestamp}

Reading plan and beginning execution...
\`\`\`

## CRITICAL

- The session_id is injected by the hook - use it directly
- Always update mission.json BEFORE starting work
- Call plan_tasks for the manifest (it degrades on an over-cap plan, never blocks); read content via plan_read with a \`section\` selector first, and via paginated plan_read (offset/limit) as the fallback — \`section\` wins over \`offset\`/\`limit\`
- The cap is a ceiling, not a wall: only a whole-file read over it is refused; windowed and section reads pass it at any file size. A \`clamped\` read names its effective window in \`hint\` — re-read that window
- Plan review is explicit: run \`/plan-review\` only when the user asks for it. Never auto-trigger a plan review
- Follow architect delegation protocols (7-section format)`
