import { z } from "zod"
import { TierNameSchema } from "./agent-overrides"

export const CategoryConfigSchema = z.object({
  /** Human-readable description of the category's purpose. Shown in task prompt. */
  description: z.string().optional(),
  model: z.string().optional(),
  /** Tier alias. Resolved at config-load time against the live provider list and
   *  converted to a concrete `model` string. Higher priority than built-in category
   *  defaults, lower priority than an explicit `model`. */
  tier: TierNameSchema.optional(),
  variant: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  maxTokens: z.number().optional(),
  thinking: z
    .object({
      type: z.enum(["enabled", "disabled"]),
      budgetTokens: z.number().optional(),
    })
    .optional(),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
  textVerbosity: z.enum(["low", "medium", "high"]).optional(),
  tools: z.record(z.string(), z.boolean()).optional(),
  prompt_append: z.string().optional(),
  /** Mark agent as unstable - forces background mode for monitoring. Auto-enabled for gemini/minimax models. */
  is_unstable_agent: z.boolean().optional(),
  /** Disable this category. Disabled categories are excluded from task delegation. */
  disable: z.boolean().optional(),
  /** Ordered list of fallback models to try when the primary model fails (e.g. rate limit, quota) */
  fallback_models: z.union([z.string(), z.array(z.string())]).optional(),
  /** Per-complexity-level model downgrades. Key is complexity level string ("1"-"5"), value is model string. */
  complexity_downgrades: z.record(z.string(), z.string()).optional(),
})

export const BuiltinCategoryNameSchema = z.enum([
  "construct",
  "source",
  "deep-jack",
  "matrix-bend",
  "bullet-time",
  "blue-pill",
  "red-pill",
  "broadcast",
])

export const CategoriesConfigSchema = z.record(z.string(), CategoryConfigSchema)

export type CategoryConfig = z.infer<typeof CategoryConfigSchema>
export type CategoriesConfig = z.infer<typeof CategoriesConfigSchema>
