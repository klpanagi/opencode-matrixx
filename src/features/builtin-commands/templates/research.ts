export const RESEARCH_TEMPLATE = `# /research — Saturation Research Command

Execute a systematic multi-round research process on the given topic.

## Usage

\`\`\`
/research <topic>                          → Full research (all directions)
/research <topic> --scope=code            → Local codebase only
/research <topic> --scope=docs            → Documentation only
/research <topic> --scope=web             → Web search only
/research <topic> --scope=oss             → OSS repos only
/research <topic> --max-rounds=3          → Limit to 3 rounds
\`\`\`

## What Happens

1. Creates artifact directory: \`.matrixx/research-<topic>-<timestamp>/\`
2. Spawns 4 parallel research agents (explore + operator swarms)
3. Collects findings, identifies new leads
4. Recursively follows leads until convergence (novelty-based stop, max 5 rounds)
5. Verifies contested claims by running code
6. Produces cited synthesis in \`final-synthesis.md\`

## Output

All artifacts written to \`.matrixx/research-<topic>-<timestamp>/\`:
- \`round-N-findings.md\` — per-round findings
- \`leads.md\` — tracked leads
- \`contested-claims.md\` — claims needing verification
- \`final-synthesis.md\` — the final cited synthesis

## Examples

\`\`\`
/research how does context window management work in this codebase
/research React 19 server component patterns --scope=web --max-rounds=3
/research authentication middleware best practices --scope=all
\`\`\`

---

Execute the full research protocol using the ulw-research skill.`
