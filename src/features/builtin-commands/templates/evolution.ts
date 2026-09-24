export const EVOLUTION_TEMPLATE = `# Evolution Command

## Purpose

Manage self-evolution proposals staged in \`.matrixx/evolution/pending\`.

## Commands

- \`/evolution list\` — list pending proposals
- \`/evolution approve <slug>\` — promote pending skill to \`.opencode/skills/<slug>/SKILL.md\`
- \`/evolution reject <slug>\` — discard pending proposal
- \`/evolution audit\` — show last 20 audit entries

---

# PHASE 1: PARSE ARGUMENTS

Arguments: $ARGUMENTS

- If empty or "list": list pending
- If "approve <slug>" or "approve <slug> --global": promote
- If "reject <slug>": discard
- If "audit" or "log": show audit
- Otherwise: show help and list pending

---

# PHASE 2: EXECUTE

Use the \`evolution\` tool for every operation below — never shell out for
evolution state. Parse $ARGUMENTS into one tool call per user request.

## List

Call \`evolution\` with \`{ "action": "list" }\`.
For each slug, call \`evolution\` with \`{ "action": "get", "slug": "<slug>" }\` to show confidence, version, derived_from.
If none: "No pending evolution proposals."

## Approve

1. Call \`evolution\` with \`{ "action": "get", "slug": "<slug>" }\` — if not found, error: "Pending <slug> not found. Run /evolution list to see available."
2. Call \`evolution\` with \`{ "action": "approve", "slug": "<slug>" }\` to promote the staged skill (audit entry recorded by the tool).
3. If argument includes --global, call \`evolution\` with \`{ "action": "approve", "slug": "<slug>", "global": true }\` instead to also copy to \`~/.agents/skills/<slug>/SKILL.md\`.
4. Confirm: "Promoted <slug> to .opencode/skills/<slug>/SKILL.md — will be loaded on next session start."

## Reject

1. Call \`evolution\` with \`{ "action": "reject", "slug": "<slug>" }\` (verifies pending exists, discards it, records the audit entry).
2. Confirm: "Rejected <slug>."

## Audit

Call \`evolution\` with \`{ "action": "status" }\` and show the audit tail section. If no entries: "No audit entries."

---

# CONSTRAINTS

- Use the \`evolution\` tool for all state ops — no bash/rtk for evolution state
- Never invent slug — read from the \`list\` action
- Keep operations atomic; report errors clearly
- Do not modify pending content — promote as-is after human review
`
