import { existsSync, unlinkSync } from "node:fs"
import { z } from "zod"
import type { PluginContext, V2ToolDefinition } from "../../plugin/types"
import { resolveDirectory, validatePlanFilePath } from "./types"

export function createPlanDeleteTool(ctx?: PluginContext): V2ToolDefinition {
  return {
    name: "plan_delete",
    description: `Delete a plan file under .matrixx/plans/*.md. Scoped unlink inside PLANS_DIR, refuses outside paths.`,
    input: z.object({
      filePath: z.string().describe("Path to plan file to delete (must be inside .matrixx/plans, kebab-case .md)"),
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
        unlinkSync(resolved)
        return { content: await (JSON.stringify({ success: true, filePath: resolved, message: `Deleted ${resolved}` })) }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: await (JSON.stringify({ error: "internal_error", message })) }
      }
    },
  }
}
