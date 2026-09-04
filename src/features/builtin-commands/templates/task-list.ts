export const TASK_LIST_TEMPLATE = `# Task List

Show current state of all file-based tasks.

Call the task_list tool now (no search, no exploration — just call the tool).

- If $ARGUMENTS contains "--all", after task_list also list counts by status (pending/in_progress/completed/deleted) by reading T-*.json files.
- If $ARGUMENTS contains "--status <value>", filter to that status.
- Otherwise just report what task_list returns as a table ID | Subject | Status.

Do not launch trinity/operator/background agents. Just call task_list.
`
