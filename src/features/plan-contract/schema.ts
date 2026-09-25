/**
 * Plan Contract Schema
 *
 * Zod v4 schema for the STRUCTURED view of an Oracle plan. The Markdown grammar
 * itself is parsed elsewhere; this validates the parsed shape.
 */

import { z } from "zod"
import type { PlanTask } from "./types"

const PlanTaskSchema = z.object({
  n: z.number().int().nonnegative(),
  title: z.string(),
  checked: z.boolean(),
  line: z.number().int().positive(),
  anchor: z.string(),
})

const PlanFrontMatterSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed"]),
  revision: z.number().int().nonnegative(),
  phase: z.string().optional(),
  wave: z.string().optional(),
  deps: z.array(z.string()).optional(),
  blockedBy: z.array(z.string()).optional(),
})

export const PlanContractSchema = z.object({
  frontMatter: PlanFrontMatterSchema.optional(),
  sections: z.array(z.string()),
  tasks: z.array(PlanTaskSchema) satisfies z.ZodType<PlanTask[]>,
  dod: z.array(z.string()),
})

/** Parsed, validated structured view of a plan. */
export type PlanContract = z.infer<typeof PlanContractSchema>
