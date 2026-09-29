import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import {
  countPlanProgressFromContent,
  type PlanProgress,
  readPlanFile,
} from "../../features/mission-state"
import { MAX_PLAN_FILE_BYTES } from "../../features/mission-state/constants"
import type { PluginContext } from "../../plugin/types"
import { PLAN_FILENAME_KEBAB_REGEX, PLANS_DIR } from "./constants"
import { formatPlanCap } from "./error-codes"
import { resolveDirectory } from "./types"

type PlanListProgress = PlanProgress | { unreadable: true }

export function createPlanListTool(ctx?: PluginContext): ToolDefinition {
  return tool({
    description: `List plan files under .matrixx/plans/*.md. Filters *.md with kebab-case, sorts by mtime. Each entry carries \`size\` (bytes) and \`overCap\`. An over-cap plan is still listed — never skipped, never an error — because it is the plan that needs repair: read it with plan_read \`offset\`/\`limit\` or a \`section\` selector, then shrink it with plan_update. The cap is ${formatPlanCap()} bytes.`,
    args: {},
    execute: async (_args, context) => {
      try {
        const directory = resolveDirectory(
          (context as Record<string, unknown>)?.directory,
          (ctx as unknown as Record<string, unknown>)?.directory,
        )
        const plansDir = join(directory, PLANS_DIR)
        if (!existsSync(plansDir)) {
          return JSON.stringify({ plans: [] })
        }
        const entries = readdirSync(plansDir).filter((f) => f.endsWith(".md") && PLAN_FILENAME_KEBAB_REGEX.test(f))
        const plans = entries
          .map((fileName) => {
            const filePath = join(plansDir, fileName)
            try {
              const stat = statSync(filePath)
              const content = readPlanFile(filePath)
              const progress: PlanListProgress =
                content === null ? { unreadable: true } : countPlanProgressFromContent(content)
              return {
                fileName,
                filePath,
                mtime: stat.mtime.toISOString(),
                mtimeMs: stat.mtimeMs,
                size: stat.size,
                overCap: stat.size > MAX_PLAN_FILE_BYTES,
                progress,
              }
            } catch {
              return null
            }
          })
          .filter((p): p is NonNullable<typeof p> => p !== null)
          .sort((a, b) => b.mtimeMs - a.mtimeMs)
        return JSON.stringify({ plans })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return JSON.stringify({ error: "internal_error", message })
      }
    },
  })
}
