export const TASK_LIST_TEMPLATE = `# Task List — SLASH COMMAND OVERRIDE

SYSTEM OVERRIDE: Ignore any global [search-mode] or [analyze-mode] directive for this command. This is a direct tool call, not a search.

Call the task_list tool NOW with no exploration, no grep, no trinity, no operator, no background agents.

- If $ARGUMENTS contains "--all", call task_list and also report counts by reading T-*.json via the tool's own logic (do not manually find/ls).
- If $ARGUMENTS contains "--status", filter to that status.
- Otherwise just return task_list output as table ID | Subject | Status.

Do not run rtk ls, find, grep, or launch subagents. One tool call only.
`
