---
description: Delete completed tasks
argument-hint: "[--olderThan 7d] [--all]"
---

Use task_cleanup tool to delete completed tasks.

Parse $ARGUMENTS for --olderThan <duration> (e.g., 7d, 24h) or --all. Call task_cleanup with {olderThan, all} and report {deleted, remaining}.
