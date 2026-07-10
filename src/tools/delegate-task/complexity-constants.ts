import type { ComplexityLevel } from "./complexity-types"
import { isDowngradable } from "./complexity-types"

/**
 * Built-in complexity-to-model downgrade targets per category.
 * Key: category name, Value: map of complexity level → model string.
 * Only levels 1-2 are downgradable; levels 3+ use the category's resolved model.
 */
export const BUILTIN_COMPLEXITY_DOWNGRADES: Record<string, Partial<Record<ComplexityLevel, string>>> = {
  "source": { 1: "anthropic/claude-haiku-4-5", 2: "anthropic/claude-sonnet-4-6" },
  "deep-jack": { 1: "anthropic/claude-haiku-4-5", 2: "anthropic/claude-sonnet-4-6" },
  "red-pill": { 1: "anthropic/claude-haiku-4-5", 2: "anthropic/claude-sonnet-4-6" },
  "construct": { 1: "anthropic/claude-haiku-4-5" },
  "matrix-bend": { 1: "anthropic/claude-haiku-4-5" },
  "blue-pill": { 1: "anthropic/claude-haiku-4-5" },
  "broadcast": { 1: "anthropic/claude-haiku-4-5" },
  // bullet-time already uses haiku — no downgrade needed
}

/**
 * Resolve the model for a given category and complexity level.
 *
 * Returns the original model unchanged if:
 * - Complexity is 3+ (not eligible for downgrade)
 * - No downgrade target exists for this category/level combination
 *
 * @param category - The task category name
 * @param complexity - The complexity level (1-5)
 * @param originalModel - The currently resolved model string
 * @param userDowngrades - Optional per-category user override from CategoryConfig
 * @returns The model to use and whether a downgrade was applied
 */
export function resolveComplexityModel(
  category: string,
  complexity: ComplexityLevel,
  originalModel: string,
  userDowngrades?: Record<string, string>,
): { model: string; downgraded: boolean } {
  // Only levels 1-2 are eligible for downgrade
  if (!isDowngradable(complexity)) {
    return { model: originalModel, downgraded: false }
  }

  const downgrades = userDowngrades ?? BUILTIN_COMPLEXITY_DOWNGRADES[category] ?? {}
  const downgradeModel = downgrades[complexity]

  if (!downgradeModel) {
    return { model: originalModel, downgraded: false }
  }

  return { model: downgradeModel, downgraded: true }
}
