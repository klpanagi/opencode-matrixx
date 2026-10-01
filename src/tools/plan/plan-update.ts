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
import { PLAN_ERROR_CODES } from "./error-codes"
import { enforcePlanCap, type PostApplyHook } from "./plan-write-guard"
import { type RawSectionEdit, resolveSectionScopedEdits, sectionWritePayload } from "./section-edit"
import { resolveDirectory, validatePlanFilePath } from "./types"

const DEFAULT_FRONT_MATTER: PlanFrontMatter = { status: "pending", revision: 1 }

const MISPLACED_SECTION_FIELDS = ["section", "sectionIndex", "contentHash"] as const

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

export function createPlanUpdateTool(ctx?: PluginContext, postApply?: PostApplyHook, cap: number = MAX_PLAN_FILE_BYTES): ToolDefinition {
  return tool({
    description: `Update a plan file under .matrixx/plans/*.md via hashline edits. Delegates to executeHashlineEditTool scoped to PLANS_DIR. Requires LINE#ID anchors, validates file exists. Re-validates the contract after the edit (WARN-first warnings), rejects edits that push the file past ${cap} bytes without persisting, and injects front-matter once when absent. SECTION-SCOPED: an edit may name \`section\` instead of hand-computing line numbers — the target's line range is re-derived from a fresh parse at write time (no line number is ever persisted), and the supplied \`contentHash\` from plan_read gates the section as a whole. A changed section is refused with section_stale naming both hashes; an unknown or renamed id is section_not_found listing the ids this plan has; a repeated section needs sectionIndex.`,
    args: {
      filePath: tool.schema.string().describe("Absolute path to the file to edit (must be inside .matrixx/plans, kebab-case .md)"),
      edits: tool.schema
        .array(
          tool.schema.object({
            op: tool.schema.union([tool.schema.literal("replace"), tool.schema.literal("append"), tool.schema.literal("prepend")]).describe("Hashline edit operation mode"),
            pos: tool.schema.string().optional().describe("Primary anchor in LINE#ID format. REQUIRED for replace. For a section-scoped edit it must be an absolute anchor of a line INSIDE that section — an anchor outside it is a validation_error. Omitted on a section-scoped append/prepend, the anchor defaults to the section's end (append: after its last non-blank line, so a trailing blank separator survives) or its start (prepend: directly under the heading)"),
            end: tool.schema.string().optional().describe("Range end anchor in LINE#ID format; on a section-scoped edit it must also be inside the section"),
            lines: tool.schema.union([tool.schema.array(tool.schema.string()), tool.schema.string(), tool.schema.null()]).describe("Replacement or inserted lines"),
            section: tool.schema.string().optional().describe("Edit inside this section only: a registry id (e.g. 'todos', 'tl-dr'), heading text, or a custom heading's derived id. PRECEDENCE: when section is present it defines the target span, and the span is re-derived from a FRESH parse at write time — pos is then interpreted relative to that span and must fall inside it"),
            sectionIndex: tool.schema.number().optional().describe("0-based occurrence index, required ONLY when the named section appears more than once in this plan (repeated H3s). Missing or out of range is a fail-closed validation_error naming the valid range — never a silent first match"),
            contentHash: tool.schema.string().optional().describe("The section's contentHash from plan_read(section). Gates the section as a whole: the writer recomputes it from the current text and refuses with section_stale (naming both hashes, writing nothing) on a mismatch. Omit to edit without the gate. It does NOT harden the 1-char per-line anchor check INSIDE the section"),
          }),
        )
        .describe("Array of edit operations to apply. After a section-scoped write the response carries `section` (the first targeted section's recomputed id/level/headingText/startLine/endLine/bytes/contentHash) and `sections` (every section's recomputed startLine/endLine/contentHash)"),
    },
    execute: async (args, context) => {
      try {
        const filePath = args.filePath as string
        const edits = args.edits as Array<Record<string, unknown>>
        if (!Array.isArray(edits) || edits.length === 0) {
          return JSON.stringify({ error: "validation_error", message: "edits must be a non-empty array" })
        }
        // `section` / `sectionIndex` / `contentHash` are PER-EDIT fields only. A
        // caller that puts them at the top level would otherwise get a successful
        // but UNGATED write — the contentHash gate never consulted — so the
        // misplacement is refused here, before any file is read or edited.
        const misplaced = MISPLACED_SECTION_FIELDS.filter((f) => (args as Record<string, unknown>)[f] !== undefined)
        if (misplaced.length > 0) {
          return JSON.stringify({
            error: PLAN_ERROR_CODES.validationError,
            message: `${misplaced.join(" / ")} must be supplied INSIDE an edit object in edits[], not as top-level arguments. Example: edits: [{ op: "replace", pos: "10#AB", lines: [...], section: "todos", contentHash: "<from plan_read(section)>" }]`,
          })
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
        // Section-scoped writes resolve their span from the file as it is RIGHT
        // NOW — a fresh parse per call, never a persisted line number.
        const scoped = resolveSectionScopedEdits(originalContent, edits as RawSectionEdit[])
        if (scoped.kind === "error") return JSON.stringify(scoped.body)
        const effectiveEdits = scoped.edits
        const result = await executeHashlineEditTool({ filePath: resolved, edits: effectiveEdits as never }, context as never, ctx)
        if (!result.startsWith("Updated")) {
          return result
        }
        // The edit is on disk but the cap has not been checked yet. Everything
        // from here to the persist is inside the guard: a throw in this window
        // would otherwise leave an over-cap (and under pre-T15, unreadable)
        // plan behind. `settled` is the commit flag — it is set on EVERY path
        // that has already reached a decision, so the `finally` restores only
        // an UNDECIDED write and never a committed one.
        let settled = false
        try {
          postApply?.()
          const postEditContent = readFileSync(resolved, "utf-8")
          const frontMatterInjected = shouldMigrate(postEditContent) && editTouchesCanonicalRegion(edits, originalContent)
          const finalContent = frontMatterInjected
            ? `${serializePlanFrontMatter(DEFAULT_FRONT_MATTER)}${postEditContent}`
            : postEditContent
          // The ONLY cap check and the ONLY rollback on the write path; the
          // hashline and section-scoped modes both arrive here.
          const verdict = enforcePlanCap(resolved, originalContent, finalContent, cap)
          if (verdict.kind === "rolled-back") {
            settled = true
            return verdict.payload
          }
          if (finalContent !== postEditContent) {
            atomicWrite(resolved, finalContent)
          }
          const { warnings } = validatePlanContract(finalContent, cap)
          settled = true
          return JSON.stringify({
            success: true,
            filePath: resolved,
            message: `Updated ${resolved}`,
            warnings,
            frontMatterInjected,
            // Every section hash is RECOMPUTED from the persisted text.
            ...(scoped.sectionIds.length === 0 ? {} : sectionWritePayload(finalContent, scoped.sectionIds)),
          })
        } finally {
          if (!settled) atomicWrite(resolved, originalContent)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return JSON.stringify({ error: "internal_error", message })
      }
    },
  })
}
