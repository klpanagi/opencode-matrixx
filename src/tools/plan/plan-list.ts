import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import {
  countPlanProgressFromContent,
  type PlanProgress,
  readPlanFile,
} from "../../features/mission-state"
import type { PluginContext, V2ToolDefinition } from "../../plugin/types"
import { PLAN_FILENAME_KEBAB_REGEX, PLANS_DIR } from "./constants"
import { resolveDirectory } from "./types"

type PlanListProgress = PlanProgress | { unreadable: true }

export function createPlanListTool(ctx?: PluginContext): V2ToolDefinition {
  return {
    name: "plan_list",
    description: `List plan files under .matrixx/plans/*.md. Filters *.md with kebab-case, sorts by mtime.`,
    input: z.object({}),
    execute: async (_args, context) => {
      try {
        const directory = resolveDirectory(
          (context as { directory?: string })?.directory,
          (ctx as unknown as { directory?: string })?.directory,
        )
        const plansDir = join(directory, PLANS_DIR)
        if (!existsSync(plansDir)) {
          return { content: await (JSON.stringify({ plans: [] })) }
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
                progress,
              }
            } catch {
              return null
            }
          })
          .filter((p): p is NonNullable<typeof p> => p !== null)
          .sort((a, b) => b.mtimeMs - a.mtimeMs)
        return { content: await (JSON.stringify({ plans })) }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: await (JSON.stringify({ error: "internal_error", message })) }
      }
    },
  }
}
