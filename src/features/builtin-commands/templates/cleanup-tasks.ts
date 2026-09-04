export const CLEANUP_TASKS_TEMPLATE = `# Cleanup Tasks Command

## Usage
\`\`\`
/cleanup-tasks [--olderThan <duration>] [--all]

Options:
  --olderThan: Only delete completed tasks older than duration (e.g., 7d, 24h, 30d). If omitted, deletes all completed regardless of age.
  --all: Delete all completed tasks (default when no olderThan given).

Examples:
  /cleanup-tasks              # delete all completed tasks
  /cleanup-tasks --olderThan 7d
  /cleanup-tasks --all
\`\`\`

## What This Command Does

Cleans up completed tasks from the file-based task system (\`~/.config/opencode/tasks/{listId}/T-*.json\`) and shrinks the TUI sidebar:

1. **Scans** \`getTaskDir()/*.json\` via \`readdirSync\`
2. **Filters** \`status==="completed"\` (and \`olderThan\` if given, via \`time_updated\`/\`time_created\`)
3. **Deletes** matching files via \`unlinkSync\`
4. **Reports** \`{deleted, remaining, deletedIds}\`
5. **TUI auto-shrinks** on next \`task-todo-mirror\` sync (300ms debounce) — \`finalTodos\` no longer contains those \`completed\` rows, fallback \`DELETE+INSERT\` writes only active \`pending\`/\`in_progress\` to \`todo\` table.

TUI now shows only \`pending\`/\`in_progress\` (0-5 rows) — history stays in git, not sidebar. Without \`/cleanup-tasks\`, completed tasks remain in files but are hidden from TUI via \`todo-sync.ts\` filter.

## Verification

After running:
- \`task_list\` → 0 pending (if no active)
- \`curl http://127.0.0.1:4096/session/<ID>/todo | jq .\` → 0 pending
- TUI \`Todos\` dock → shows only active, not 119 ✓
- Files: \`ls ~/.config/opencode/tasks/matrixx/ | wc -l\` decreases by \`deleted\`

---

<command-instruction>
You are executing the cleanup-tasks command. Use the task_cleanup tool to delete completed tasks.

Parse arguments from $ARGUMENTS:
- If "--olderThan" present, extract duration (e.g., "7d", "24h") → pass as olderThan
- Otherwise pass all:true (delete all completed)

Call task_cleanup with {olderThan, all} and report result.
</command-instruction>

<user-request>
$ARGUMENTS
</user-request>
`
