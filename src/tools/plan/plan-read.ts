import { existsSync, statSync } from "node:fs"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import { readPlanFile } from "../../features/mission-state/plan-storage"
import type { PluginContext } from "../../plugin/types"
import { computeLineHash, formatHashLine } from "../hashline-edit/hash-computation"
import { MAX_PLAN_FILE_BYTES, MAX_PLAN_READ_RENDERED_BYTES } from "./constants"
import {
  type PlanOutlineEntry,
  type PlanReadFormat,
  resolveDirectory,
  validatePlanFilePath,
} from "./types"

const TRUNCATION_HINT = "Use plan_tasks for the manifest, or paginate plan_read with offset/limit"

function normalizePositive(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  const rounded = Math.floor(value)
  return rounded >= 1 ? rounded : undefined
}

function selectLines(
  lines: string[],
  offset?: number,
  limit?: number,
): { selected: string[]; startIndex: number } {
  const startIndex = (normalizePositive(offset) ?? 1) - 1
  const count = normalizePositive(limit)
  const endIndex = count === undefined ? lines.length : startIndex + count
  return { selected: lines.slice(startIndex, endIndex), startIndex }
}

function renderHashline(lines: string[], startIndex: number): string {
  return lines.map((line, index) => formatHashLine(startIndex + index + 1, line)).join("\n")
}

function buildOutline(lines: string[]): PlanOutlineEntry[] {
  const outline: PlanOutlineEntry[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const lineNumber = index + 1
    const anchor = `${lineNumber}#${computeLineHash(lineNumber, line)}`
    const heading = /^##\s+(.+)$/.exec(line)
    if (heading) {
      outline.push({ level: 2, text: heading[1].trim(), line: lineNumber, anchor })
      continue
    }
    const task = /^[-*]\s*\[[ xX]\]\s*\d+\.\s*(.+)$/.exec(line)
    if (task) {
      outline.push({ level: 3, text: task[1].trim(), line: lineNumber, anchor })
    }
  }
  return outline
}

export function createPlanReadTool(ctx?: PluginContext): ToolDefinition {
  return tool({
    description: `Read a plan file from .matrixx/plans/*.md, returning EXACTLY ONE payload for the selected format: 'hashline' (default; 1#AB|content anchors for plan_update) or 'content' (raw lines) — never both. Paginate with offset (1-based start line, inclusive) and limit (line count); returned anchors stay absolute. If the selected format's rendered payload exceeds ${MAX_PLAN_READ_RENDERED_BYTES} bytes, returns {truncated, outline, hint} with no payload — use plan_tasks for the manifest, or paginate with offset/limit. Hard cap ${MAX_PLAN_FILE_BYTES} file bytes.`,
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
        .describe("1-based start line (inclusive) for pagination; default whole file"),
      limit: tool.schema
        .number()
        .optional()
        .describe("Number of lines to return from offset; default to end of file"),
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
        try {
          const stat = statSync(resolved)
          if (stat.size > MAX_PLAN_FILE_BYTES) {
            return JSON.stringify({
              error: "file_too_large",
              message: `File exceeds ${MAX_PLAN_FILE_BYTES} bytes (${stat.size}).`,
              hint: "Split the plan into smaller files via plan_create (one kebab-case .md per section).",
              filePath: resolved,
              size: stat.size,
            })
          }
        } catch {}
        const content = readPlanFile(resolved)
        if (content === null) {
          return JSON.stringify({
            error: "read_failed",
            message: `Failed to read ${resolved} (too large or unreadable, cap ${MAX_PLAN_FILE_BYTES})`,
            filePath: resolved,
          })
        }
        const format: PlanReadFormat = args.format === "content" ? "content" : "hashline"
        const lines = content.split("\n")
        const { selected, startIndex } = selectLines(
          lines,
          args.offset as number | undefined,
          args.limit as number | undefined,
        )
        const result =
          format === "content"
            ? { filePath: resolved, content: selected.join("\n") }
            : {
                filePath: resolved,
                hashline: content === "" ? "" : renderHashline(selected, startIndex),
              }
        if (JSON.stringify(result).length > MAX_PLAN_READ_RENDERED_BYTES) {
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
