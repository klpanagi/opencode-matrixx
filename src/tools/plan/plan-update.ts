import { existsSync, readFileSync } from "node:fs"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import { atomicWrite } from "../../features/mission-state/plan-storage"
import {
  findAppendixStart,
  type PlanFrontMatter,
  serializePlanFrontMatter,
  shouldMigrate,
  validatePlanContract,
} from "../../features/plan-contract"
import type { PluginContext } from "../../plugin/types"
import { executeHashlineEditTool } from "../hashline-edit/hashline-edit-executor"
import { MAX_PLAN_FILE_BYTES } from "./constants"
import { resolveDirectory, validatePlanFilePath } from "./types"

const DEFAULT_FRONT_MATTER: PlanFrontMatter = { status: "pending", revision: 1 }

function parseAnchorLine(anchor: string): number | null {
  const match = /^(\d+)#/.exec(anchor)
  return match ? Number.parseInt(match[1] as string, 10) : null
}

/**
 * True when at least one edit targets the canonical region — everything before
 * `## Appendix`, or the whole file when no appendix exists. Appendix-only edits
 * do not trigger front-matter injection.
 */
function editTouchesCanonicalRegion(edits: Array<Record<string, unknown>>, originalContent: string): boolean {
  const appendixIndex = findAppendixStart(originalContent)
  if (appendixIndex === -1) return true
  return edits.some((edit) => {
    if (edit.op === "prepend" && edit.pos === undefined) return true
    const line = typeof edit.pos === "string" ? parseAnchorLine(edit.pos) : null
    return line !== null && line <= appendixIndex
  })
}

/** Mirror of `plan_create`'s hard cap rejection payload. */
function sizeExceededPayload(resolved: string, length: number): string {
  return JSON.stringify({
    error: "size_exceeded",
    message: `Plan exceeds 102400 bytes — split the plan into smaller plans (${length}/${MAX_PLAN_FILE_BYTES} bytes)`,
    hint: "Reduce the plan below 102,400 bytes or split it into multiple .matrixx/plans/*.md files.",
    filePath: resolved,
  })
}

export function createPlanUpdateTool(ctx?: PluginContext): ToolDefinition {
  return tool({
    description: `Update a plan file under .matrixx/plans/*.md via hashline edits. Delegates to executeHashlineEditTool scoped to PLANS_DIR. Requires LINE#ID anchors, validates file exists. Re-validates the contract after the edit (WARN-first warnings), rejects edits that push the file past ${MAX_PLAN_FILE_BYTES} bytes without persisting, and injects front-matter once when absent.`,
    args: {
      filePath: tool.schema.string().describe("Absolute path to the file to edit (must be inside .matrixx/plans, kebab-case .md)"),
      edits: tool.schema
        .array(
          tool.schema.object({
            op: tool.schema.union([tool.schema.literal("replace"), tool.schema.literal("append"), tool.schema.literal("prepend")]).describe("Hashline edit operation mode"),
            pos: tool.schema.string().optional().describe("Primary anchor in LINE#ID format"),
            end: tool.schema.string().optional().describe("Range end anchor in LINE#ID format"),
            lines: tool.schema.union([tool.schema.array(tool.schema.string()), tool.schema.string(), tool.schema.null()]).describe("Replacement or inserted lines"),
          }),
        )
        .describe("Array of edit operations to apply"),
    },
    execute: async (args, context) => {
      try {
        const filePath = args.filePath as string
        const edits = args.edits as Array<Record<string, unknown>>
        if (!Array.isArray(edits) || edits.length === 0) {
          return JSON.stringify({ error: "validation_error", message: "edits must be a non-empty array" })
        }
        for (const e of edits) {
          const op = (e as { op?: string }).op
          if (op === "replace" || op === "append" || op === "prepend") {
            const pos = (e as { pos?: string }).pos
            if (op === "replace" && (!pos || typeof pos !== "string" || pos.trim() === "")) {
              return JSON.stringify({ error: "validation_error", message: "replace op requires LINE#ID pos anchor" })
            }
            if ((op === "append" || op === "prepend") && pos !== undefined) {
              if (typeof pos !== "string" || pos.trim() === "") {
                return JSON.stringify({ error: "validation_error", message: `${op} pos must be LINE#ID if provided` })
              }
            }
          }
        }
        const directory = resolveDirectory(
          (context as Record<string, unknown>)?.directory,
          (ctx as unknown as Record<string, unknown>)?.directory,
        )
        const validation = validatePlanFilePath(filePath, directory)
        if ("error" in validation) {
          return JSON.stringify({ error: "invalid_file_path", message: validation.error })
        }
        const resolved = validation.resolved
        if (!existsSync(resolved)) {
          return JSON.stringify({ error: "file_not_found", message: `File not found: ${resolved}` })
        }
        const originalContent = readFileSync(resolved, "utf-8")
        const result = await executeHashlineEditTool({ filePath: resolved, edits: edits as never }, context as never, ctx)
        if (!result.startsWith("Updated")) {
          return result
        }
        const postEditContent = readFileSync(resolved, "utf-8")
        const frontMatterInjected = shouldMigrate(postEditContent) && editTouchesCanonicalRegion(edits, originalContent)
        const finalContent = frontMatterInjected
          ? `${serializePlanFrontMatter(DEFAULT_FRONT_MATTER)}${postEditContent}`
          : postEditContent
        if (finalContent.length > MAX_PLAN_FILE_BYTES) {
          atomicWrite(resolved, originalContent)
          return sizeExceededPayload(resolved, finalContent.length)
        }
        if (finalContent !== postEditContent) {
          atomicWrite(resolved, finalContent)
        }
        const { warnings } = validatePlanContract(finalContent)
        return JSON.stringify({
          success: true,
          filePath: resolved,
          message: `Updated ${resolved}`,
          warnings,
          frontMatterInjected,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return JSON.stringify({ error: "internal_error", message })
      }
    },
  })
}
