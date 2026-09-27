import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import type { MatrixxConfig } from "../../config/schema"
import { getTaskDir } from "../../features/task-storage/storage"
import { getStaleAfterMs, isTaskStale } from "../../hooks/task-continuation-enforcer/staleness"
import { log } from "../../shared/logger"

const TERMINAL_STATUSES = new Set(["completed", "deleted"])
const ACTIVE_STATUSES = new Set(["pending", "in_progress"])

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
  ctx?: PluginInput,
): ToolDefinition {
  return tool({
    description: `[TRACKING — local progress records only. Spawns nothing, executes nothing.]
Delete reclaimable task files from storage.

Scans getTaskDir()/*.json and deletes terminal tasks (status "completed" or "deleted"),
optionally restricted to those olderThan.
olderThan supports "7d", "24h", "30m" format (regex ^(\\d+)(d|h|m)$).

Set stale=true to ALSO reclaim abandoned active tasks (status "pending" or "in_progress")
whose file mtime is older than the threshold. Threshold = olderThan when given, else
tasks.stale_after_hours (default 24h). Staleness uses file mtime; olderThan on terminal
tasks uses the record's own timestamp. Active tasks are never reclaimed without stale=true.

Returns counts: {deleted, remaining, deletedIds}`,
    args: {
      olderThan: tool.schema.string().optional().describe('Only delete tasks older than duration (e.g. "7d", "24h", "30m"). For terminal tasks this uses the record timestamp; in stale mode it sets the mtime threshold.'),
      all: tool.schema.boolean().optional().describe("Delete all reclaimable tasks (default true when olderThan not set)"),
      stale: tool.schema.boolean().optional().describe("Also reclaim abandoned pending/in_progress tasks older than the threshold (default false)"),
    },
    execute: async (args: Record<string, unknown>, context?: { sessionID: string }): Promise<string> => {
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

        const directory =
          ((context as unknown as Record<string, unknown>)?.directory as string | undefined) ??
          ((ctx as unknown as Record<string, unknown>)?.directory as string | undefined) ??
          process.cwd()
        const taskDir = getTaskDir(config, directory)

        if (!existsSync(taskDir)) {
          return JSON.stringify({ deleted: 0, remaining: 0, deletedIds: [] })
        }

        const files = readdirSync(taskDir).filter((f) => f.endsWith(".json") && f.startsWith("T-"))
        const total = files.length
        const deletedIds: string[] = []
        const reclaimStale = args.stale === true
        const staleThresholdMs = reclaimStale ? (olderThanMs ?? getStaleAfterMs(config)) : null

        for (const file of files) {
          const filePath = join(taskDir, file)
          let raw: Record<string, unknown>
          try {
            const content = readFileSync(filePath, "utf-8")
            raw = JSON.parse(content) as Record<string, unknown>
          } catch {
            continue
          }
          const status = typeof raw.status === "string" ? raw.status : ""
          const id = typeof raw.id === "string" ? raw.id : file.replace(".json", "")

          if (TERMINAL_STATUSES.has(status)) {
            if (olderThanMs !== null) {
              const ts = getTaskTimestamp(raw)
              if (Date.now() - ts <= olderThanMs) continue
            }
          } else if (reclaimStale && ACTIVE_STATUSES.has(status) && staleThresholdMs !== null) {
            if (!isTaskStale(filePath, staleThresholdMs)) continue
          } else {
            continue
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
