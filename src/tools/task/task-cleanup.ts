import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import type { MatrixxConfig } from "../../config/schema"
import { getTaskDir } from "../../features/task-storage/storage"
import { log } from "../../shared/logger"

function parseOlderThan(value: string): number | null {
  const match = value.trim().match(/^(\d+)(d|h|m)$/)
  if (!match) return null
  const amount = Number(match[1])
  const unit = match[2] as "d" | "h" | "m"
  if (unit === "d") return amount * 24 * 60 * 60 * 1000
  if (unit === "h") return amount * 60 * 60 * 1000
  return amount * 60 * 1000
}

function getTaskTimestamp(task: unknown): number {
  const raw = task as Record<string, unknown>
  const candidate =
    raw.time_updated ??
    raw.time_created ??
    raw.updatedAt ??
    raw.createdAt ??
    raw.timeUpdated ??
    raw.timeCreated ??
    null
  if (candidate === null || candidate === undefined) return Date.now()
  if (typeof candidate === "number") return candidate
  if (typeof candidate === "string") {
    const parsed = Date.parse(candidate)
    if (!Number.isNaN(parsed)) return parsed
    const asNum = Number(candidate)
    if (!Number.isNaN(asNum)) return asNum
    return Date.now()
  }
  return Date.now()
}

export function createTaskCleanupTool(
  config: Partial<MatrixxConfig>,
  _ctx?: PluginInput,
): ToolDefinition {
  return tool({
    description: `Delete completed task files from storage.

Scans getTaskDir()/*.json, filters status==="completed" and optionally olderThan.
olderThan supports "7d", "24h", "30m" format (regex ^(\\d+)(d|h|m)$).
Returns counts: {deleted, remaining, deletedIds}`,
    args: {
      olderThan: tool.schema.string().optional().describe('Only delete completed tasks older than duration (e.g. "7d", "24h", "30m")'),
      all: tool.schema.boolean().optional().describe("Delete all completed tasks (default true when olderThan not set)"),
    },
    execute: async (args: Record<string, unknown>): Promise<string> => {
      try {
        const olderThan = args.olderThan as string | undefined

        let olderThanMs: number | null = null
        if (olderThan !== undefined) {
          const parsed = parseOlderThan(olderThan)
          if (parsed === null) {
            return JSON.stringify({
              error: "validation_error",
              message: `Invalid olderThan format: "${olderThan}". Expected e.g. "7d", "24h", "30m"`,
            })
          }
          olderThanMs = parsed
        }

        const taskDir = getTaskDir(config)

        if (!existsSync(taskDir)) {
          return JSON.stringify({ deleted: 0, remaining: 0, deletedIds: [] })
        }

        const files = readdirSync(taskDir).filter((f) => f.endsWith(".json") && f.startsWith("T-"))
        const total = files.length
        const deletedIds: string[] = []

        for (const file of files) {
          const filePath = join(taskDir, file)
          let raw: Record<string, unknown>
          try {
            const content = readFileSync(filePath, "utf-8")
            raw = JSON.parse(content) as Record<string, unknown>
          } catch {
            continue
          }
          if (raw.status !== "completed") continue
          const id = typeof raw.id === "string" ? raw.id : file.replace(".json", "")

          if (olderThanMs !== null) {
            const ts = getTaskTimestamp(raw)
            const age = Date.now() - ts
            if (age <= olderThanMs) continue
          }

          try {
            unlinkSync(filePath)
            deletedIds.push(id)
          } catch (err) {
            log("[task-cleanup] Failed to delete", { file, error: String(err) })
          }
        }

        return JSON.stringify({
          deleted: deletedIds.length,
          remaining: total - deletedIds.length,
          deletedIds,
        })
      } catch (error) {
        return JSON.stringify({ error: "internal_error", message: error instanceof Error ? error.message : String(error) })
      }
    },
  })
}
