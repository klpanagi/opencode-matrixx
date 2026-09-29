import { existsSync } from "node:fs"
import { basename } from "node:path"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import { countPlanProgressFromContent } from "../../features/mission-state"
import { measurePlanBytes } from "../../features/mission-state/constants"
import { atomicWrite, ensurePlanDir, upsertMetadataComment } from "../../features/mission-state/plan-storage"
import { validatePlanContract } from "../../features/plan-contract"
import type { PluginContext } from "../../plugin/types"
import { MAX_PLAN_FILE_BYTES } from "./constants"
import { planSizeExceededFields } from "./error-codes"
import { resolveDirectory, validatePlanFilePath } from "./types"

export function createPlanCreateTool(ctx?: PluginContext): ToolDefinition {
  return tool({
    description: `Create a new plan file under .matrixx/plans/*.md.\nValidated via isAllowedFile(join(directory,PLANS_DIR), filePath) + .md + kebab-case.\nUses atomicWrite (.tmp.pid+rename) + upsertMetadataComment. Warns if file already exists.`,
    args: {
      filePath: tool.schema.string().describe("Path to plan file (must be inside .matrixx/plans, kebab-case .md)"),
      content: tool.schema.string().describe("Markdown content for the plan"),
    },
    execute: async (args, context) => {
      try {
        const filePath = args.filePath as string
        const content = args.content as string
        if (typeof content !== "string") {
          return JSON.stringify({ error: "validation_error", message: "content is required" })
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
        ensurePlanDir(directory)
        if (existsSync(resolved)) {
          return JSON.stringify({
            error: "file_exists",
            message: `Plan file already exists: ${resolved}. Use plan_read + plan_update to modify.`,
            filePath: resolved,
          })
        }
        const contract = validatePlanContract(content)
        const id = basename(resolved, ".md")
        const sessionId = (context as Record<string, unknown>)?.sessionID as string | undefined ?? "unknown"
        const { total, completed } = countPlanProgressFromContent(content)
        const meta = {
          id,
          updatedAt: new Date().toISOString(),
          sessionId,
          todoTotal: total,
          todoCompleted: completed,
        }
        const contentWithMeta = upsertMetadataComment(content, meta)
        const byteLength = measurePlanBytes(contentWithMeta)
        if (byteLength > MAX_PLAN_FILE_BYTES) {
          return JSON.stringify({
            error: "size_exceeded",
            ...planSizeExceededFields(byteLength),
          })
        }
        const ok = atomicWrite(resolved, contentWithMeta)
        if (!ok) {
          return JSON.stringify({ error: "write_failed", message: `Failed to write ${resolved}` })
        }
        return JSON.stringify({
          success: true,
          filePath: resolved,
          message: `Created plan ${resolved}`,
          warnings: contract.warnings,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return JSON.stringify({ error: "internal_error", message })
      }
    },
  })
}
