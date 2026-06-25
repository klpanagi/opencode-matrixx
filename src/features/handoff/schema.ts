import { z } from "zod"

/**
 * Handoff YAML frontmatter + body Zod schemas.
 *
 * Pure schema definitions — no I/O, no side effects. Used by:
 * - `validateHandoffYaml` (this folder) for parsing & validating handoff files
 * - future write-side tooling to construct frontmatter programmatically
 */

export const GitHeadSchema = z.object({
  sha: z.string().min(1),
  branch: z.string().optional(),
  detached: z.boolean().optional(),
})
export type GitHead = z.infer<typeof GitHeadSchema>

export const HandoffFrontmatterSchema = z.object({
  session_id: z.string().min(1),
  timestamp: z.string().datetime(),
  git_head: GitHeadSchema,
  topics: z.array(z.string()).min(1),
})
export type HandoffFrontmatter = z.infer<typeof HandoffFrontmatterSchema>

export const HandoffKeyFileSchema = z.object({
  path: z.string().min(1),
  purpose: z.string(),
})
export type HandoffKeyFile = z.infer<typeof HandoffKeyFileSchema>

export const HandoffDecisionSchema = z.object({
  decision: z.string(),
  rationale: z.string(),
})
export type HandoffDecision = z.infer<typeof HandoffDecisionSchema>

export const HandoffSectionSchema = z.object({
  user_requests: z.string(),
  goal: z.string(),
  work_completed: z.array(z.string()),
  current_state: z.string(),
  pending_tasks: z.array(z.string()).optional(),
  key_files: z.array(HandoffKeyFileSchema).optional(),
  important_decisions: z.array(HandoffDecisionSchema).optional(),
  explicit_constraints: z.array(z.string()).optional(),
  context_for_continuation: z.string().optional(),
})
export type HandoffSection = z.infer<typeof HandoffSectionSchema>

export const HandoffSchema = z.object({
  frontmatter: HandoffFrontmatterSchema,
  sections: HandoffSectionSchema,
})
export type HandoffData = z.infer<typeof HandoffSchema>

/**
 * Validated handoff with the markdown body preserved.
 * Returned by `validateHandoffYaml` on success.
 */
export type HandoffFileData = HandoffData & { body: string }

