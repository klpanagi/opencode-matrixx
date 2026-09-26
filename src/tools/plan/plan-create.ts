import { existsSync } from "node:fs"
import { basename } from "node:path"
import { z } from "zod"
import { countPlanProgressFromContent } from "../../features/mission-state"
import { atomicWrite, ensurePlanDir, upsertMetadataComment } from "../../features/mission-state/plan-storage"
import { validatePlanContract } from "../../features/plan-contract"
import type { PluginContext, V2ToolDefinition } from "../../plugin/types"
import { MAX_PLAN_FILE_BYTES } from "./constants"
import { resolveDirectory, validatePlanFilePath } from "./types"

export function createPlanCreateTool(ctx?: PluginContext): V2ToolDefinition {
  return {
    name: "plan_create",
    description: `Create a new plan file under .matrixx/plans/*.md.\nValidated via isAllowedFile(join(directory,PLANS_DIR), filePath) + .md + kebab-case.\nUses atomicWrite (.tmp.pid+rename) + upsertMetadataComment. Warns if file already exists.`,
    input: z.object({
      filePath: z.string().describe("Path to plan file (must be inside .matrixx/plans, kebab-case .md)"),
      content: z.string().describe("Markdown content for the plan"),
    }),
    execute: async (args, context) => {
      try {
        const filePath = args.filePath as string
        const content = args.content as string
        if (typeof content !== "string") {
          return { content: await (JSON.stringify({ error: "validation_error", message: "content is required" })) }
        }
        const directory = resolveDirectory(
          (context as { directory?: string })?.directory,
          (ctx as unknown as { directory?: string })?.directory,
        )
        const validation = validatePlanFilePath(filePath, directory)
        if ("error" in validation) {
          return { content: await (JSON.stringify({ error: "invalid_file_path", message: validation.error })) }
        }
        const resolved = validation.resolved
        ensurePlanDir(directory)
        if (existsSync(resolved)) {
          return { content: await (JSON.stringify({
            error: "file_exists",
            message: `Plan file already exists: ${resolved}. Use plan_read + plan_update to modify.`,
            filePath: resolved,
          })) }
        }
        const contract = validatePlanContract(content)
        const id = basename(resolved, ".md")
        const sessionId = (context as { sessionID?: string })?.sessionID as string | undefined ?? "unknown"
        const { total, completed } = countPlanProgressFromContent(content)
        const meta = {
          id,
          updatedAt: new Date().toISOString(),
          sessionId,
          todoTotal: total,
          todoCompleted: completed,
        }
        const contentWithMeta = upsertMetadataComment(content, meta)
        const byteLength = Buffer.byteLength(contentWithMeta, "utf8")
        if (byteLength > MAX_PLAN_FILE_BYTES) {
          return { content: await (JSON.stringify({
            error: "size_exceeded",
            message: `Plan exceeds 102400 bytes — split the plan into smaller plans (${byteLength}/${MAX_PLAN_FILE_BYTES} bytes)`,
            hint: "Reduce the plan below 102,400 bytes or split it into multiple .matrixx/plans/*.md files.",
          })) }
        }
        const ok = atomicWrite(resolved, contentWithMeta)
        if (!ok) {
          return { content: await (JSON.stringify({ error: "write_failed", message: `Failed to write ${resolved}` })) }
        }
        return { content: await (JSON.stringify({
          success: true,
          filePath: resolved,
          message: `Created plan ${resolved}`,
          warnings: contract.warnings,
        })) }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: await (JSON.stringify({ error: "internal_error", message })) }
      }
    },
  }
}
