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

/**
 * The contract shape, plus the two invariants the parser guarantees and a bare
 * `z.array(z.string())` could not express.
 *
 * 1. `sections` entries are non-empty. A heading whose title normalizes away to
 *    nothing (e.g. a bare `## (MANDATORY)`) is a PARSER artefact, not a
 *    section, and silently accepting one would let a malformed heading reach
 *    every section-addressed consumer as a nameless target.
 * 2. `tasks` are in ASCENDING document order. `parsePlanTasks` is a single
 *    top-down scan, so ordering is a real invariant; enforcing it here catches a
 *    future re-implementation that sorts or filters tasks.
 *
 * `title` is deliberately NOT constrained to be non-empty: the live corpus
 * contains real numbered tasks written as `- [x] 11.` with no title text
 * (`plan-section-addressing.md`), and a plan is not wrong just because a task
 * line is terse. Constraining it would be tightening the schema against
 * reality rather than describing it.
 *
 * Both invariants were verified against every plan in `.matrixx/plans/` before
 * being added (0 violations across 36 plans / 289 tasks).
 */
export const PlanContractSchema = z
  .object({
    frontMatter: PlanFrontMatterSchema.optional(),
    sections: z.array(z.string().min(1)),
    tasks: z.array(PlanTaskSchema) satisfies z.ZodType<PlanTask[]>,
    dod: z.array(z.string()),
  })
  .superRefine((contract, ctx) => {
    contract.tasks.forEach((task, index) => {
      const previous = contract.tasks[index - 1]
      if (previous !== undefined && task.line <= previous.line) {
        ctx.addIssue({
          code: "custom",
          path: ["tasks", index, "line"],
          message: `task line ${task.line} does not follow ${previous.line} in document order`,
        })
      }
    })
  })

/** Parsed, validated structured view of a plan. */
export type PlanContract = z.infer<typeof PlanContractSchema>
