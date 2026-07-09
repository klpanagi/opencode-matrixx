import type { ComplexityLevel } from "./complexity-types"

export interface ComplexityScorerInput {
  /** Short task description (3-5 words) */
  description?: string
  /** Full task prompt content */
  prompt?: string
  /** Skill names requested */
  loadSkills?: string[]
  /** Task category name */
  category?: string
}

/** Keywords that indicate trivial work — level 1 */
const TRIVIAL_KEYWORDS = [
  "typo", "fix comment", "rename", "delete", "remove", "spelling",
  "cosmetic", "whitespace", "formatting",
]

/** Keywords that indicate simple work — level 2 */
const SIMPLE_KEYWORDS = [
  "add utility", "simple", "minor", "small change", "one-line",
  "quick fix", "straightforward", "utility",
]

/** Keywords that indicate complex work — level 4 */
const COMPLEX_KEYWORDS = [
  "refactor", "redesign", "migration", "database", "state management",
  "async", "concurrent", "optimization", "performance",
]

/** Keywords that indicate architectural work — level 5 */
const ARCHITECTURAL_KEYWORDS = [
  "system-wide", "multi-module", "architecture", "cross-cutting",
  "platform", "infrastructure", "orchestration",
]

/**
 * Category baseline complexity levels.
 * Used when no keyword signal is present to provide a sensible default.
 */
export const CATEGORY_BASELINE: Partial<Record<string, ComplexityLevel>> = {
  "bullet-time": 1,
  "blue-pill": 2,
  "construct": 3,
  "broadcast": 3,
  "matrix-bend": 3,
  "source": 4,
  "deep-jack": 4,
  "red-pill": 4,
}

/**
 * Auto-score complexity from task context.
 *
 * Heuristic:
 * 1. Start with category baseline (defaults to 3 for unknown categories)
 * 2. Keyword detection in description/prompt can override:
 *    - Trivial keywords → level 1 (unless complex keywords also present)
 *    - Simple keywords → level 2 (unless complex keywords also present)
 *    - Architectural keywords → level 5
 *    - Complex keywords → level 4
 * 3. Skills signal: many skills bump minimum score
 *
 * Returns a ComplexityLevel (1-5).
 */
export function autoScoreComplexity(input: ComplexityScorerInput): ComplexityLevel {
  const text = [input.description, input.prompt].filter(Boolean).join(" ").toLowerCase()
  const category = input.category ?? ""

  // 1. Check category baseline
  const baseline: number = CATEGORY_BASELINE[category] ?? 3

  // 2. Keyword analysis
  const hasTrivial = TRIVIAL_KEYWORDS.some(k => text.includes(k))
  const hasSimple = SIMPLE_KEYWORDS.some(k => text.includes(k))
  const hasComplex = COMPLEX_KEYWORDS.some(k => text.includes(k))
  const hasArchitectural = ARCHITECTURAL_KEYWORDS.some(k => text.includes(k))

  // Compute score: complex/architectural keywords override baseline upward;
  // trivial/simple keywords downgrade baseline (unless complex keywords present)
  let score: number
  if (hasTrivial && !hasComplex) {
    score = 1
  } else if (hasSimple && !hasComplex) {
    score = 2
  } else if (hasArchitectural) {
    score = 5
  } else if (hasComplex) {
    score = 4
  } else {
    score = baseline
  }

  // 3. Skills signal — many skills = more complex
  const skillCount = input.loadSkills?.length ?? 0
  if (skillCount >= 6 && score < 4) {
    score = 4
  } else if (skillCount >= 4 && score < 3) {
    score = 3
  }

  return Math.min(5, Math.max(1, Math.round(score))) as ComplexityLevel
}
