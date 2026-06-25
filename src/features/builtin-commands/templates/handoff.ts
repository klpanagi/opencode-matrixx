export const HANDOFF_TEMPLATE = `# Handoff Command

## Purpose

Use /handoff when:
- The current session context is getting too long and quality is degrading
- You want to start fresh while preserving essential context from this session
- The context window is approaching capacity

This creates a detailed context summary written to .matrixx/handoff.md. The next session loads it via /pickup.

---

# PHASE 0: VALIDATE REQUEST

Before proceeding, confirm:
- [ ] There is meaningful work or context in this session to preserve
- [ ] The user wants to create a handoff summary (not just asking about it)

If the session is nearly empty or has no meaningful context, inform the user there is nothing substantial to hand off.

---

# PHASE 1: GATHER PROGRAMMATIC CONTEXT

Execute these tools to gather concrete data:

1. session_read({ session_id: "$SESSION_ID" }) — full session history
2. todoread() — current task progress
3. Bash({ command: "git diff --stat HEAD~10..HEAD" }) — recent file changes
4. Bash({ command: "git status --porcelain" }) — uncommitted changes

Analyze the gathered outputs to understand:
- What the user asked for (exact wording)
- What work was completed
- What tasks remain incomplete
- What decisions were made
- What files were modified or discussed
- What patterns, constraints, or preferences were established

---

# PHASE 2: CALL HANDOFF TOOL

Call the \`handoff\` tool with \`action="create"\` and the data you gathered. The tool validates the input and writes the handoff file automatically — no manual file writing needed.

Use these field mappings for the tool arguments:

\`\`\`
handoff({
  action: "create",
  topics: ["tag1", "tag2"],              // Min 1 topic tag, from session context
  user_requests: "verbatim user msg",     // REQUIRED — exact wording from session_read
  goal: "single sentence",                // REQUIRED — what should be done next
  work_completed: ["did X", "did Y"],     // REQUIRED — first-person bullet points
  current_state: "state description",     // REQUIRED — current codebase/task state
  pending_tasks: ["task1", "task2"],      // Optional — tasks not yet completed
  key_files: [{path, purpose}],           // Optional — max 10, workspace-relative paths
  important_decisions: [{decision, rationale}], // Optional — key decisions made
  explicit_constraints: ["verbatim"],     // Optional — verbatim constraints only
  context_for_continuation: "..."         // Optional — additional context
})
\`\`\`

---

# PHASE 3: INFORM USER

After the tool call completes, inform the user:

\`\`\`
Handoff saved to .matrixx/handoff.md. Use /pickup in a new session to load this context.
\`\`\`

---

# IMPORTANT CONSTRAINTS

- DO gather programmatic context before calling the tool (Phase 1 is mandatory)
- DO extract user_requests verbatim from session_read output (do not paraphrase)
- DO keep goal to a single sentence
- DO use workspace-relative paths for key_files
- DO NOT attempt to create new sessions programmatically
- DO NOT exceed 10 files in key_files
- DO NOT include sensitive information (API keys, credentials, secrets)
`
