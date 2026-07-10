import type { CategoryConfig } from "../config/schema";
import { mergeCategories } from "../shared/merge-categories";

export function resolveCategoryConfig(
  categoryName: string,
  userCategories?: Record<string, CategoryConfig>,
): CategoryConfig | undefined {
  return mergeCategories(userCategories)[categoryName];
}
