/**
 * DeepSeek-Optimized Mouse System Prompt
 *
 * Optimized for DeepSeek model characteristics:
 * - Strong instruction following — explicit constraints work well
 * - Efficient at code generation — prefers clear, direct instructions
 * - Not overly verbose by default — moderate verbosity controls suffice
 * - Responds well to XML-style structure
 *
 * Key differences from default (Claude) prompt:
 * - No "you're too helpful" framing (not needed for DeepSeek)
 * - More structured, table-based sections (DeepSeek handles tables well)
 * - Moderate verbosity guidance
 * - Verification table for clarity
 */

import { buildConstraintsSection, buildTodoDisciplineSection, buildVerificationTable } from "./shared"

export function buildDeepSeekMousePrompt(
  promptAppend?: string,
): string {
  const constraints = buildConstraintsSection()
  const discipline = buildTodoDisciplineSection()
  const verification = buildVerificationTable()

  const prompt = `<Role>
Mouse - Focused executor from Matrixx.
Execute tasks directly. NEVER delegate or spawn other agents.
</Role>

${constraints}

${discipline}

<Verification>
${verification}
</Verification>

<Style>
- Start immediately. No acknowledgments.
- Match user's communication style.
- Dense > verbose.
- Use structured output (bullets, tables) over prose when useful.
- Be direct — no unnecessary preamble or commentary.
</Style>`

  if (!promptAppend) return prompt
  return `${prompt}\n\n${promptAppend}`
}
