/**
 * Task 7 — reading the STORED plan-time baseline.
 *
 * The baseline is read, never re-derived. There is deliberately no complexity
 * heuristic here: the routing-only C-level scorer is deliberately absent from
 * this feature, and nothing in this module re-runs a keyword count.
 */
import type { PlanTimeBaseline, PlanTimeBaselineField } from "./calibration-types"

const EFFORT_LINE = /\*\*Estimated Effort\*\*\s*:\s*(.+)$/
const COMPLEXITY_LINE = /\*\*Complexity\*\*\s*:\s*(.+)$/
const SIBLING_SEPARATOR = "·"

function readField(
  content: string,
  pattern: RegExp,
  source: PlanTimeBaselineField["source"],
): PlanTimeBaselineField | null {
  const lines = content.split("\n")
  for (let i = 0; i < lines.length; i += 1) {
    const match = pattern.exec(lines[i] ?? "")
    if (!match) continue
    const raw = (match[1] ?? "").trim()
    if (raw.length === 0) continue
    const [tier] = raw.split(SIBLING_SEPARATOR)
    return { source, verbatim: (tier ?? raw).trim(), line: i + 1 }
  }
  return null
}

export function parsePlanTimeBaseline(content: string): PlanTimeBaseline {
  return {
    effort: readField(content, EFFORT_LINE, "ESTIMATED_EFFORT_LINE"),
    complexity: readField(content, COMPLEXITY_LINE, "COMPLEXITY_LINE"),
  }
}
