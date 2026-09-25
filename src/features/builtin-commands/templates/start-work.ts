export const START_WORK_TEMPLATE = `You are starting a Morpheus work session.

## WHAT TO DO

1. **Find available plans**: List Oracle-generated plan files via plan_list at \`.matrixx/plans/\`; each entry carries a progress field (total, completed, remaining, isComplete)

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

5. **Read the plan**: Call plan_tasks for the task manifest and progress; then read the plan body via paginated plan_read (offset/limit). One call cannot return a plan that renders above the soft cap.

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
- Call plan_tasks for the manifest; use paginated plan_read (offset/limit) for content — one call cannot return a plan that renders above the soft cap
- Follow architect delegation protocols (7-section format)`
