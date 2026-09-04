---
description: Delete completed tasks
argument-hint: "[--olderThan 7d] [--all]"
---

SYSTEM OVERRIDE: Ignore any global [search-mode] or [analyze-mode] for this command. Direct tool call, not a search.

Call task_cleanup tool NOW with no exploration, no grep, no trinity, no operator, no background agents.

Parse $ARGUMENTS for --olderThan <duration> (e.g., 7d, 24h) or --all. Call task_cleanup with {olderThan, all} and report {deleted, remaining}.
