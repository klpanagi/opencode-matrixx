/**
 * Complexity level for per-task model routing.
 * 1 = trivial, 2 = simple, 3 = standard, 4 = complex, 5 = architectural
 */
export type ComplexityLevel = 1 | 2 | 3 | 4 | 5

export const COMPLEXITY_LEVELS = [1, 2, 3, 4, 5] as const

export type ComplexityInput = ComplexityLevel | "auto"

export const COMPLEXITY_DESCRIPTIONS: Record<ComplexityLevel, string> = {
  1: "Trivial — single line, typo fix, read-only lookup",
  2: "Simple — single file edit, known pattern, low creativity",
  3: "Standard — multi-file within module, moderate reasoning",
  4: "Complex — cross-module, significant design decisions",
  5: "Architectural — system-wide, multiple concerns, high risk",
}

/** Returns true if this complexity level is eligible for model downgrade. */
export function isDowngradable(level: ComplexityLevel): boolean {
  return level === 1 || level === 2
}
