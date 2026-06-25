export const PICKUP_TEMPLATE = `# Pickup Command

## Purpose

Use /pickup to load handoff context from a previous session.

---

# PHASE 1: READ HANDOFF

Call handoff({ action: "read" }) to load the handoff context.

If the response starts with Error:, inform the user:
"No handoff context found. Run /handoff in a previous session first to create one."
Then STOP — do not proceed.

---

# PHASE 2: ACKNOWLEDGE

Summarize the loaded context to the user:
- What the previous session was working on (Goal)
- What was completed (Work Completed)
- What remains (Pending Tasks)

Then state: "Handoff context loaded. Ready to continue."

---

# PHASE 3: ARCHIVE

Call handoff({ action: "archive" }) to mark the handoff as consumed.
This prevents it from being picked up again.

---

# CONSTRAINTS

- DO call the handoff tool — do not read files directly
- DO NOT modify the handoff content — use it as-is
- DO begin working immediately if the user included a task with /pickup
`
