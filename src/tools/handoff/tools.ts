import { z } from "zod"
import type { V2ToolDefinition, V2ToolsRecord } from "../../plugin/types"
import { handleArchive } from "./archive-handler"
import { HANDOFF_DESCRIPTION } from "./constants"
import { type HandoffCreateArgs, handleCreate } from "./create-handler"
import { handleList } from "./list-handler"
import { handleRead } from "./read-handler"

/**
 * Flat args shape for the multi-action `handoff` tool.
 *
 * `z` in the OpenCode SDK does not support `.discriminatedUnion()`
 * cleanly across the type-narrowing required by each action, so we use a
 * single flat shape: every `create`-only field is `.optional()`, and the
 * `execute` body branches on `args.action` to apply the right behavior.
 *
 * This trades off a little schema noise (LLMs see all fields at once) for
 * predictable runtime dispatch and trivial test setup.
 */
type HandoffToolArgs = {
  action: "create" | "read" | "list" | "archive"
  // create-only fields
  topics?: string[]
  user_requests?: string
  goal?: string
  work_completed?: string[]
  current_state?: string
  pending_tasks?: string[]
  key_files?: { path: string; purpose: string }[]
  important_decisions?: { decision: string; rationale: string }[]
  explicit_constraints?: string[]
  context_for_continuation?: string
}

/**
 * `handoff` tool factory.
 *
 * Exposes a single `handoff` tool that the LLM dispatches via its `action`
 * argument. Action handlers are split out into sibling files
 * (`create-handler`, `read-handler`, `archive-handler`, `list-handler`) so
 * this dispatcher stays small and each handler can evolve independently.
 */
export function createHandoffTools(ctx: { directory: string }): V2ToolsRecord {
  const handoff: V2ToolDefinition = {
    name: "handoff",
    description: HANDOFF_DESCRIPTION,
    input: z.object({
      action: z
        .enum(["create", "read", "list", "archive"])
        .describe(
          "Which handoff operation to perform: 'create' writes a new handoff, 'read' loads the active one, 'archive' marks the active one as consumed, 'list' shows all handoff files."
        ),

      // -------- create-only fields (all optional at the schema layer) --------

      topics: z
        .array(z.string())
        .min(1)
        .optional()
        .describe("(action=create) Topic tags for the handoff (e.g., ['auth', 'refactor'])"),
      user_requests: z
        .string()
        .optional()
        .describe("(action=create) Verbatim user requests (do not paraphrase)"),
      goal: z
        .string()
        .optional()
        .describe("(action=create) One-sentence description of what should be done next"),
      work_completed: z
        .array(z.string())
        .optional()
        .describe("(action=create) First-person bullet points of what was done"),
      current_state: z
        .string()
        .optional()
        .describe("(action=create) Current state of the codebase or task"),
      pending_tasks: z
        .array(z.string())
        .optional()
        .describe("(action=create) Tasks planned but not completed"),
      key_files: z
        .array(
          z.object({
            path: z.string(),
            purpose: z.string(),
          })
        )
        .optional()
        .describe("(action=create) Key files for continuing the work"),
      important_decisions: z
        .array(
          z.object({
            decision: z.string(),
            rationale: z.string(),
          })
        )
        .optional()
        .describe("(action=create) Important decisions and their rationale"),
      explicit_constraints: z
        .array(z.string())
        .optional()
        .describe("(action=create) Verbatim constraints only"),
      context_for_continuation: z
        .string()
        .optional()
        .describe("(action=create) Additional context the next session should know"),
    }),
    execute: async (args: HandoffToolArgs, context) => {
      try {
        //#when - dispatch on the `action` field
        switch (args.action) {
          case "create": {
            // Narrow the optional create fields; validation lives in the handler.
            const createArgs: HandoffCreateArgs = {
              topics: args.topics ?? [],
              user_requests: args.user_requests ?? "",
              goal: args.goal ?? "",
              work_completed: args.work_completed ?? [],
              current_state: args.current_state ?? "",
              pending_tasks: args.pending_tasks,
              key_files: args.key_files,
              important_decisions: args.important_decisions,
              explicit_constraints: args.explicit_constraints,
              context_for_continuation: args.context_for_continuation,
            }
            return { content: await (await handleCreate(createArgs, ctx, context)) }
          }
          case "read":
            return { content: await (handleRead(ctx.directory)) }
          case "list":
            return { content: await (handleList(ctx.directory)) }
          case "archive":
            return { content: await (handleArchive(ctx.directory)) }
          default: {
            // Exhaustiveness check: the zod enum should make this unreachable.
            const _exhaustive: never = args.action
            return { content: await (`Error: unknown action: ${String(_exhaustive)}`) }
          }
        }
      } catch (e) {
        return { content: await (`Error: ${e instanceof Error ? e.message : String(e)}`) }
      }
    },
  }

  return { handoff }
}
