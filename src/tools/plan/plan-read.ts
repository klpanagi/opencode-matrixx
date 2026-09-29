import { existsSync, statSync } from "node:fs"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import { measurePlanBytes } from "../../features/mission-state/constants"
import { readPlanFile, readPlanFileSpan } from "../../features/mission-state/plan-storage"
import type { PluginContext } from "../../plugin/types"
import { formatHashLine } from "../hashline-edit/hash-computation"
import { MAX_PLAN_FILE_BYTES, MAX_PLAN_READ_RENDERED_BYTES } from "./constants"
import {
  classifyReadRefusal,
  fileTooLargePayload,
  PLAN_ERROR_CODES,
  readFailedPayload,
} from "./error-codes"
import { clampWindowToRenderedBudget, selectLines } from "./plan-read-pagination"
import { buildOutline } from "./section-index"
import { readSection } from "./section-read"
import {
  type PlanReadFormat,
  resolveDirectory,
  validatePlanFilePath,
} from "./types"

const TRUNCATION_HINT = "Use plan_tasks for the manifest, or paginate plan_read with offset/limit"

function renderHashline(lines: string[], startIndex: number): string {
  return lines.map((line, index) => formatHashLine(startIndex + index + 1, line)).join("\n")
}

export function createPlanReadTool(ctx?: PluginContext): ToolDefinition {
  return tool({
    description: `Read a plan file from .matrixx/plans/*.md, returning EXACTLY ONE payload for the selected format: 'hashline' (default; 1#AB|content anchors for plan_update) or 'content' (raw lines) — never both. Paginate with offset (1-based start line, inclusive) and limit (line count); returned anchors stay absolute. PRECEDENCE: section WINS over offset/limit — when both are supplied the section defines the base span and the response reports precedence:"section" plus the effective absolute startLine/endLine. section reads one plan section (registry id or heading text) and return ONLY that span alongside its metadata (id, level, startLine, endLine, bytes, contentHash); a section that appears more than once (e.g. repeated H3s) needs sectionIndex (0-based) or the read is a fail-closed validation_error listing the valid range, and an unknown id is a section_not_found listing the ids this plan has. A single section over the rendered cap degrades to {truncated, outline-within-section, hint} — never a failure, never an empty payload. If the selected format's rendered payload exceeds ${MAX_PLAN_READ_RENDERED_BYTES} bytes, returns {truncated, outline, hint} with no payload — use plan_tasks for the manifest, or paginate with offset/limit. SIZE CEILING, not a wall: the ${MAX_PLAN_FILE_BYTES}-byte cap is refused (file_too_large) for an unbounded WHOLE-FILE read only. Supply offset/limit or a section and the read is allowed past the cap, because a span is bounded by your own window; an over-large window is clamped to the ${MAX_PLAN_READ_RENDERED_BYTES}-byte rendered budget and answered with {clamped:true, limit:<effective line count>, hint} naming the effective window.`,
    args: {
      filePath: tool.schema
        .string()
        .describe("Path to plan file (must be inside .matrixx/plans, kebab-case .md)"),
      format: tool.schema
        .enum(["hashline", "content"])
        .optional()
        .describe("Output format: 'hashline' (default) or 'content' — exactly one is returned"),
      offset: tool.schema
        .number()
        .optional()
        .describe(
          "1-based start line (inclusive) for pagination; omit for whole file. Present but invalid (< 1, non-finite) is a validation_error, not a silent fallback",
        ),
      limit: tool.schema
        .number()
        .optional()
        .describe(
          "Number of lines to return from offset; omit to read to end of file. Present but invalid (< 1, non-finite) is a validation_error, not a silent fallback",
        ),
      section: tool.schema
        .string()
        .optional()
        .describe(
          "Section to read: a registry id (e.g. 'todos', 'tl-dr'), heading text, or a custom heading's derived id. Returns ONLY that section's span plus its metadata (id, level, startLine, endLine, bytes, contentHash). PRECEDENCE: section WINS over offset/limit — when both are supplied the section defines the base span and the response reports precedence:'section' with the effective absolute startLine/endLine, so the conflict is never silent. Omit for a whole-file read",
        ),
      sectionIndex: tool.schema
        .number()
        .optional()
        .describe(
          "0-based occurrence index, required ONLY when the section appears more than once in this plan (repeated H3s). Missing or out of range is a fail-closed validation_error naming the valid range — never a silent first match",
        ),
    },
    execute: async (args, context) => {
      try {
        const filePath = args.filePath as string
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
        const selector = typeof args.section === "string" ? args.section.trim() : ""
        const paginated = args.offset !== undefined || args.limit !== undefined
        // A SPAN read (any window) is bounded by the caller's own selector, so the
        // cap is a ceiling it may read past. A WHOLE-FILE read is the unbounded one
        // and is still refused outright.
        const spanRead = paginated || selector !== ""
        let sizeOverCap: number | null = null
        let readErrno: string | null = null
        try {
          const stat = statSync(resolved)
          if (stat.size > MAX_PLAN_FILE_BYTES) sizeOverCap = stat.size
        } catch (error) {
          readErrno = (error as NodeJS.ErrnoException).code ?? "EUNKNOWN"
        }
        if (sizeOverCap !== null && !spanRead) {
          return fileTooLargePayload(resolved, sizeOverCap, MAX_PLAN_FILE_BYTES)
        }
        const content = spanRead ? readPlanFileSpan(resolved) : readPlanFile(resolved)
        if (content === null) {
          let defensiveSize: number | null = null
          try {
            const stat = statSync(resolved)
            if (stat.size > MAX_PLAN_FILE_BYTES) defensiveSize = stat.size
          } catch (error) {
            readErrno = (error as NodeJS.ErrnoException).code ?? "EUNKNOWN"
          }
          const refusal = classifyReadRefusal({ sizeOverCap: defensiveSize, errno: readErrno })
          return refusal === PLAN_ERROR_CODES.fileTooLarge && defensiveSize !== null
            ? fileTooLargePayload(resolved, defensiveSize, MAX_PLAN_FILE_BYTES)
            : readFailedPayload(resolved, readErrno ?? undefined)
        }
        const format: PlanReadFormat = args.format === "content" ? "content" : "hashline"
        const lines = content.split("\n")
        if (selector !== "") {
          const sectionIndex = args.sectionIndex as number | undefined
          if (sectionIndex !== undefined && (!Number.isInteger(sectionIndex) || sectionIndex < 0)) {
            return JSON.stringify({
              error: PLAN_ERROR_CODES.validationError,
              argument: "sectionIndex",
              message: "sectionIndex must be a non-negative integer (0-based occurrence); omit it unless the section appears more than once",
            })
          }
          const outcome = readSection({
            filePath: resolved,
            content,
            lines,
            format,
            selector,
            sectionIndex,
            paginated,
          })
          return JSON.stringify(outcome.body)
        }
        const selection = selectLines(
          lines,
          args.offset as number | undefined,
          args.limit as number | undefined,
        )
        if ("argument" in selection) {
          return JSON.stringify({
            error: PLAN_ERROR_CODES.validationError,
            argument: selection.argument,
            message: selection.message,
          })
        }
        const { selected, startIndex } = selection
        const render = (slice: string[]) =>
          format === "content"
            ? { filePath: resolved, content: slice.join("\n") }
            : { filePath: resolved, hashline: content === "" ? "" : renderHashline(slice, startIndex) }
        // The hard cap is now a CEILING for a span read, so this render budget is the
        // only thing between an over-cap plan and the context window.
        if (sizeOverCap !== null) {
          const { payload } = clampWindowToRenderedBudget(lines, startIndex, selected.length, MAX_PLAN_READ_RENDERED_BYTES, (count, slice) => {
            if (count >= selected.length) return render(slice)
            const endLine = startIndex + count
            return {
              ...render(slice),
              clamped: true,
              limit: count,
              hint: `Window clamped to lines ${startIndex + 1}-${endLine} to fit the ${MAX_PLAN_READ_RENDERED_BYTES}-byte rendered budget — continue at offset ${endLine + 1}`,
            }
          })
          return JSON.stringify(payload)
        }
        const result = render(selected)
        if (measurePlanBytes(JSON.stringify(result)) > MAX_PLAN_READ_RENDERED_BYTES) {
          return JSON.stringify({ truncated: true, outline: buildOutline(lines), hint: TRUNCATION_HINT })
        }
        return JSON.stringify(result)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return JSON.stringify({ error: "internal_error", message })
      }
    },
  })
}
