import { existsSync, statSync } from "node:fs"
import { z } from "zod"
import { countPlanProgressFromContent, readPlanFile } from "../../features/mission-state"
import { parsePlanContract } from "../../features/plan-contract"
import type { PluginContext, V2ToolDefinition } from "../../plugin/types"
import { MAX_PLAN_FILE_BYTES } from "./constants"
import { resolveDirectory, validatePlanFilePath } from "./types"

/**
 * Return the file's byte size when it exceeds the hard cap, else null.
 * Stat failure is non-fatal: readPlanFile enforces the cap defensively.
 */
function sizeOverHardCap(path: string): number | null {
  try {
    const size = statSync(path).size
    return size > MAX_PLAN_FILE_BYTES ? size : null
  } catch {
    return null
  }
}

export function createPlanTasksTool(ctx?: PluginContext): V2ToolDefinition {
  return {
    name: "plan_tasks",
    description: `Return a compact manifest for a plan file: filePath, progress (total/completed/remaining/isComplete/needsTriage), numbered tasks (n, title, checked, line, LINE#ID anchor) and definition-of-done lines. Does NOT emit the plan body — use plan_read for content. Hard cap ${MAX_PLAN_FILE_BYTES} file bytes.`,
    input: z.object({
      filePath: z
        .string()
        .describe("Path to plan file (must be inside .matrixx/plans, kebab-case .md)"),
    }),
    execute: async (args, context) => {
      try {
        const filePath = args.filePath as string
        const directory = resolveDirectory(
          (context as { directory?: string })?.directory,
          (ctx as unknown as { directory?: string })?.directory,
        )
        const validation = validatePlanFilePath(filePath, directory)
        if ("error" in validation) {
          return { content: await (JSON.stringify({ error: "invalid_file_path", message: validation.error })) }
        }
        const resolved = validation.resolved
        if (!existsSync(resolved)) {
          return { content: await (JSON.stringify({ error: "file_not_found", message: `File not found: ${resolved}` })) }
        }
        const oversized = sizeOverHardCap(resolved)
        if (oversized !== null) {
          return { content: await (JSON.stringify({
            error: "file_too_large",
            message: `File exceeds ${MAX_PLAN_FILE_BYTES} bytes (${oversized}).`,
            hint: "Split the plan into smaller files via plan_create (one kebab-case .md per section).",
            filePath: resolved,
            size: oversized,
          })) }
        }
        const content = readPlanFile(resolved)
        if (content === null) {
          return { content: await (JSON.stringify({
            error: "read_failed",
            message: `Failed to read ${resolved} (too large or unreadable, cap ${MAX_PLAN_FILE_BYTES})`,
            filePath: resolved,
          })) }
        }
        const progress = countPlanProgressFromContent(content)
        const contract = parsePlanContract(content)
        const manifest = {
          filePath: resolved,
          progress: {
            total: progress.total,
            completed: progress.completed,
            remaining: progress.total - progress.completed,
            isComplete: progress.isComplete,
            ...(progress.needsTriage ? { needsTriage: true } : {}),
          },
          tasks: contract.tasks,
          dod: contract.dod,
        }
        return { content: await (JSON.stringify(manifest)) }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: await (JSON.stringify({ error: "internal_error", message })) }
      }
    },
  }
}
