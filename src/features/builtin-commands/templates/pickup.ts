export const PICKUP_TEMPLATE = `# Pickup Command

## Purpose

Use /pickup to load handoff context from a previous session.
This reads the .matrixx/handoff.md file created by /handoff and uses it as context for this session.

---

# PHASE 1: LOAD HANDOFF FILE

1. Read the file .matrixx/handoff.md using the Read tool
2. If the file does not exist, inform the user:
   "No handoff context found. Run /handoff in a previous session first to create one."
   Then STOP — do not proceed to Phase 2.

---

# PHASE 2: ARCHIVE THE FILE

After successfully reading the handoff content:

1. Rename .matrixx/handoff.md to .matrixx/handoff.consumed.md using Bash:
   Bash({ command: "mv .matrixx/handoff.md .matrixx/handoff.consumed.md" })

This prevents the same handoff from being picked up again.

---

# PHASE 3: APPLY CONTEXT

1. Acknowledge the loaded context to the user with a brief summary:
   - What the previous session was working on (from GOAL section)
   - What was completed (from WORK COMPLETED section)
   - What remains (from PENDING TASKS section)

2. State: "Handoff context loaded. Ready to continue."

3. If the user provided additional instructions with the /pickup command, begin working on those immediately using the handoff context.

---

# IMPORTANT CONSTRAINTS

- DO read the handoff file using the Read tool — do not guess or fabricate context
- DO archive the file after reading to prevent duplicate pickups
- DO NOT modify the handoff content — use it as-is for context
- DO NOT attempt to load handoff.consumed.md — that is a previously consumed handoff
- DO summarize the context briefly — the user wants to know what was picked up
- DO begin working immediately if the user provided a task alongside /pickup
`
