import { VERIFICATION_REMINDER } from "./system-reminder-templates"

function buildVerificationReminder(sessionId: string): string {
  return `${VERIFICATION_REMINDER}

---

**If ANY verification fails, use this immediately:**
\`\`\`
task(session_id="${sessionId}", prompt="fix: [describe the specific failure]")
\`\`\``
}

export function buildOrchestratorReminder(
  planName: string,
  progress: { total: number; completed: number },
  sessionId: string
): string {
  const remaining = progress.total - progress.completed
  return `
---

**MISSION STATE:** Plan: \`${planName}\` | ${progress.completed}/${progress.total} done | ${remaining} remaining

---

${buildVerificationReminder(sessionId)}

**STEP 5: READ SUBAGENT NOTEPAD (LEARNINGS, ISSUES, PROBLEMS)**

The subagent was instructed to record findings in notepad files. Read them NOW:
\`\`\`
Glob(".matrixx/notepads/${planName}/*.md") (if Glob is unavailable, Read each known notepad file directly)
\`\`\`
Then \`Read\` each file found — especially:
- **learnings.md**: Patterns, conventions, successful approaches discovered
- **issues.md**: Problems, blockers, gotchas encountered during work
- **problems.md**: Unresolved issues, technical debt flagged

**USE this information to:**
- Inform your next delegation (avoid known pitfalls)
- Adjust your plan if blockers were discovered
- Propagate learnings to subsequent subagents

**STEP 6: CHECK MISSION STATE DIRECTLY (EVERY TIME — NO EXCEPTIONS)**

Do NOT rely on cached progress. Check mission state NOW:
\`\`\`
plan_tasks(planPath=".matrixx/plans/${planName}.md")
\`\`\`
This returns a compact manifest with progress counts. If full content is needed, use \`plan_read(filePath=".matrixx/plans/${planName}.md", offset=N, limit=M)\` to paginate.

**STEP 7: MARK COMPLETION IN PLAN FILE (IMMEDIATELY — NON-NEGOTIABLE)**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**CRITICAL: THIS STEP IS MANDATORY. Skipping it = progress lost.**

RIGHT NOW — Do not delay. Verification passed → Mark IMMEDIATELY.

1. Call \`plan_read(filePath=".matrixx/plans/${planName}.md")\` to get LINE#ID anchors
2. Find the \`- [ ]\` checkbox line for the completed task and note its LINE#ID
3. Call \`plan_update(filePath=".matrixx/plans/${planName}.md", edits=[{op:"replace", pos:"LINE#ID", lines:"...- [x]..."}])\` to mark complete
4. Verify the update was applied by calling \`plan_tasks\` again

**WARNING**: If you skip this step, the task appears UNDONE.
The system counts \`- [x]\` checkboxes to track progress.
No checkbox = No progress = Work wasted.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**STEP 8: COMMIT ATOMIC UNIT**

- Stage ONLY the verified changes
- Commit with clear message describing what was done

**STEP 9: PROCEED TO NEXT TASK**

- Call \`plan_tasks\` AGAIN to identify the next \`- [ ]\` task
- Start immediately - DO NOT STOP

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**${remaining} tasks remain. Keep jacking-in.**`
}

export function buildStandaloneVerificationReminder(sessionId: string): string {
  return `
---

${buildVerificationReminder(sessionId)}

**STEP 5: CHECK YOUR PROGRESS DIRECTLY (EVERY TIME — NO EXCEPTIONS)**

Do NOT rely on memory or cached state. Run \`todoread\` NOW to see exact current state.
Count pending vs completed tasks. This is your ground truth for what comes next.

**STEP 6: UPDATE TODO STATUS (IMMEDIATELY)**

RIGHT NOW - Do not delay. Verification passed → Mark IMMEDIATELY.

1. Run \`todoread\` to see your todo list
2. Mark the completed task as \`completed\` using \`todowrite\`

**DO THIS BEFORE ANYTHING ELSE. Unmarked = Untracked = Lost progress.**

**STEP 7: EXECUTE QA TASKS (IF ANY)**

If QA tasks exist in your todo list:
- Execute them BEFORE proceeding
- Mark each QA task complete after successful verification

**STEP 8: PROCEED TO NEXT PENDING TASK**

- Run \`todoread\` AGAIN to identify the next \`pending\` task
- Start immediately - DO NOT STOP

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**NO TODO = NO TRACKING = INCOMPLETE WORK. Use todowrite aggressively.**`
}
