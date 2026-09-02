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

## List

Use bash: \`ls -1 .matrixx/evolution/pending/*.md 2>/dev/null | xargs -I {} basename {} .md\` or \`rtk ls .matrixx/evolution/pending\`
For each slug, read \`.matrixx/evolution/pending/<slug>.meta.json\` to show confidence, version, derived_from.
If none: "No pending evolution proposals."

## Approve

1. Verify \`.matrixx/evolution/pending/<slug>.md\` exists — if not, error: "Pending <slug> not found. Run /evolution list to see available."
2. Copy staged skill:
   - \`mkdir -p .opencode/skills/<slug>\`
   - \`cp .matrixx/evolution/pending/<slug>.md .opencode/skills/<slug>/SKILL.md\`
   - Also preserve versioned copy: \`mkdir -p .matrixx/evolution/skills/<slug>/versions && cp .matrixx/evolution/pending/<slug>.md .matrixx/evolution/skills/<slug>/SKILL.md\`
3. Append audit: \`echo '{"action":"promoted","slug":"<slug>","timestamp":"'$(date -Iseconds)'"}' >> .matrixx/evolution/audit.log\`
4. Remove pending: \`rm .matrixx/evolution/pending/<slug>.md .matrixx/evolution/pending/<slug>.meta.json\`
5. If argument includes --global, also copy to \`~/.agents/skills/<slug>/SKILL.md\`
6. Confirm: "Promoted <slug> to .opencode/skills/<slug>/SKILL.md — will be loaded on next session start."

## Reject

1. Verify pending exists
2. \`rm .matrixx/evolution/pending/<slug>.md .matrixx/evolution/pending/<slug>.meta.json\`
3. Append audit with action rejected
4. Confirm: "Rejected <slug>."

## Audit

Read \`.matrixx/evolution/audit.log\` last 20 lines: \`tail -n 20 .matrixx/evolution/audit.log 2>/dev/null || echo "No audit entries."\`

---

# CONSTRAINTS

- Use bash/rtk for file ops — no dedicated evolution tool yet
- Never invent slug — read from pending dir
- Keep operations atomic; report errors clearly
- Do not modify pending content — promote as-is after human review
`
