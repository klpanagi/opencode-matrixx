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
  /**
   * Lifecycle status. Forward-only: pending -> in_progress -> completed.
   * A backward jump (e.g. completed -> in_progress) is rejected by
   * {@link isPlanStatusTransitionAllowed} unless the caller passes the
   * explicit `{ forceCompletion: true }` override. The schema itself
   * constrains the VALUE to this enum; the ORDER invariant lives in the
   * transition helper because Zod validates one snapshot, not a pair of
   * snapshots (before/after).
   */
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

/**
 * Canonical forward order of {@link PlanStatus}. Frozen: pending (0) ->
 * in_progress (1) -> completed (2). A transition is forward when its target
 * index is >= its source index (identity rewrites are idempotent, not jumps).
 */
export const PLAN_STATUS_ORDER = ["pending", "in_progress", "completed"] as const

/** Explicit override that permits an otherwise-rejected backward jump. */
export interface PlanStatusTransitionOptions {
  /** When true, a backward jump is honored instead of rejected. */
  forceCompletion?: boolean
}

/**
 * Forward-only transition rule (documented invariant, enforced here).
 *
 * Returns true when moving from `from` to `to` is allowed: same-status or
 * forward steps always pass; a backward step passes ONLY with
 * `{ forceCompletion: true }`. Unknown statuses (outside the enum) return
 * false — the schema rejects them at parse time and this guard rejects them
 * at transition time.
 */
export function isPlanStatusTransitionAllowed(
  from: string,
  to: string,
  options?: PlanStatusTransitionOptions,
): boolean {
  const fromIndex = (PLAN_STATUS_ORDER as readonly string[]).indexOf(from)
  const toIndex = (PLAN_STATUS_ORDER as readonly string[]).indexOf(to)
  if (fromIndex === -1 || toIndex === -1) return false
  if (toIndex >= fromIndex) return true
  return options?.forceCompletion === true
}

/** Inputs to the completion AND-gate (checkbox state + front-matter status). */
export interface PlanCompletionGateInput {
  /** True when every numbered checkbox in the plan body is checked. */
  allChecked: boolean
  /** Authoritative front-matter `status` value. */
  status: string
  /** Explicit human override; when true the gate passes regardless. */
  forceCompletion?: boolean
}

/**
 * AND-gate vs override rule for plan completion.
 *
 * A plan counts as complete ONLY when (all checkboxes checked AND
 * `status === \"completed\"`). Any mismatch (checked but status lagging, or
 * status completed while boxes remain open) evaluates to false so the caller
 * can surface a WARN advisory — never silently auto-complete. The explicit
 * human flag `{ forceCompletion: true }` overrides the gate and returns true.
 */
export function isPlanComplete(input: PlanCompletionGateInput): boolean {
  if (input.forceCompletion === true) return true
  return input.allChecked === true && input.status === "completed"
}
