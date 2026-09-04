export const TASK_LIST_TEMPLATE = `# Task List Command

## Usage
\`\`\`
/task-list [--all] [--status <pending|in_progress|completed|deleted>]

Options:
  --all: Show all tasks including completed and deleted (default: active only)
  --status: Filter by specific status (e.g., --status completed)

Examples:
  /task-list              # show active tasks (pending + in_progress)
  /task-list --all        # show all tasks with status counts
  /task-list --status completed
\`\`\`

## What This Command Does

Shows current state of all file-based tasks (\`~/.config/opencode/tasks/{listId}/T-*.json\`):

1. **Calls** \`task_list\` tool (active) and scans \`getTaskDir()/*.json\` for full status breakdown when --all
2. **Groups** by \`status\`: \`pending\`, \`in_progress\`, \`completed\`, \`deleted\`
3. **Reports** counts, IDs, subjects, blockedBy, and TUI visibility (TUI shows only pending/in_progress after filter)
4. **Hints** at cleanup: if many \`completed\`, suggest \`/cleanup-tasks\`

TUI \`Todos\` shows only \`pending\`/\`in_progress\` (filtered in \`todo-sync.ts\`), but this command shows the full project-wise state.

---

<command-instruction>
You are executing the task-list command. Show current state of all tasks.

Parse $ARGUMENTS:
- If "--all" in args, show all statuses with counts (scan T-*.json via task_list + file scan)
- If "--status <value>" present, filter to that status
- Otherwise call task_list tool (active only) and report.

Use task_list tool for active tasks. For --all, also read getTaskDir() files to count completed/deleted. Present as table: ID | Subject | Status | BlockedBy. Summarize pending/in_progress/completed/deleted counts and note TUI shows only pending/in_progress.
</command-instruction>

<user-request>
$ARGUMENTS
</user-request>
`
