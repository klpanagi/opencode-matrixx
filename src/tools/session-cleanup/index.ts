import type { PluginInput } from "@opencode-ai/plugin"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import { log } from "../../shared"
import { normalizeSDKResponse } from "../../shared/normalize-sdk-response"
import { isRecord } from "../../shared/record-type-guard"

export const SESSION_CLEANUP_DESCRIPTION = `Delete leaked Matrixx-created sessions from the OpenCode session list.

Older Matrixx versions created a real top-level session (no parentID) on every
evolution-compressor run and never deleted it, so the TUI session list filled up
with dozens of "evolution-compressor" entries. This tool removes them.

Safety rules:
- Dry run by default. Nothing is deleted unless you pass apply=true.
- ONLY parentless sessions are touched. A session that has a parentID is already
  hidden from the TUI list, so it is never a candidate.
- Only titles matching known Matrixx patterns are considered. Your own sessions
  (including "Pickup ...") are never touched.
- include_look_at is opt-in and off by default.`

const KNOWN_LEAK_TITLE = "evolution-compressor"
const LOOK_AT_PREFIX = "look_at: "

type SessionRow = {
  id: string
  title: string
  directory: string
  parentID?: string
}

function isNotFound(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? "")
  return text.includes("404")
}

function isLeakTitle(title: string, includeLookAt: boolean): boolean {
  if (title === KNOWN_LEAK_TITLE) return true
  return includeLookAt && title.startsWith(LOOK_AT_PREFIX)
}

/**
 * Extracts candidate rows from the SDK list payload.
 *
 * The SDK's `Session` type is fully typed, but the payload arrives through a
 * generated client that may hand back a wrapper object, so each row is
 * re-validated rather than trusted.
 */
function collectLeaked(payload: unknown, includeLookAt: boolean): SessionRow[] {
  const sessions = normalizeSDKResponse<unknown[]>(payload, [])
  const leaked: SessionRow[] = []
  for (const entry of sessions) {
    if (!isRecord(entry)) continue
    const id = entry.id
    const title = entry.title
    const directory = entry.directory
    if (typeof id !== "string" || id.length === 0) continue
    if (typeof title !== "string" || !isLeakTitle(title, includeLookAt)) continue
    // A parented session is hidden from the TUI list, so it is not clutter.
    if (typeof entry.parentID === "string" && entry.parentID.length > 0) continue
    leaked.push({
      id,
      title,
      directory: typeof directory === "string" ? directory : "",
    })
  }
  return leaked
}

function summarize(rows: SessionRow[], apply: boolean): string {
  if (rows.length === 0) return "No leaked sessions found."
  const listing = rows.map((row) => `- ${row.id}  "${row.title}"  (${row.directory})`).join("\n")
  if (!apply) {
    return [
      `Dry run: ${rows.length} leaked session(s) matched. Nothing was deleted.`,
      "Re-run with apply=true to delete them.",
      "",
      listing,
    ].join("\n")
  }
  return `Deleting ${rows.length} leaked session(s)...`
}

export function createSessionCleanupTool(ctx: PluginInput): ToolDefinition {
  return tool({
    description: SESSION_CLEANUP_DESCRIPTION,
    args: {
      apply: tool.schema
        .boolean()
        .optional()
        .describe("Actually delete. Defaults to false (dry run)."),
      include_look_at: tool.schema
        .boolean()
        .optional()
        .describe("Also match 'look_at: *' sessions. Defaults to false."),
    },
    async execute(args) {
      const apply = args.apply === true
      const includeLookAt = args.include_look_at === true

      try {
        // list() is intentionally NOT scoped by directory: leaked sessions can
        // belong to any project, and the tool deletes them wherever they live.
        const listed = await ctx.client.session.list()
        const leaked = collectLeaked(listed, includeLookAt)

        if (leaked.length === 0) return summarize(leaked, apply)
        if (!apply) return summarize(leaked, apply)

        const failures: string[] = []
        let deleted = 0
        for (const row of leaked) {
          try {
            const result = await ctx.client.session.delete({
              path: { id: row.id },
              ...(row.directory ? { query: { directory: row.directory } } : {}),
            })
            if (isRecord(result) && result.error !== undefined && result.error !== null) {
              if (isNotFound(result.error)) {
                deleted += 1
                continue
              }
              failures.push(`${row.id}: ${String(result.error)}`)
              continue
            }
            deleted += 1
          } catch (error) {
            if (isNotFound(error)) {
              deleted += 1
              continue
            }
            failures.push(`${row.id}: ${String(error)}`)
          }
        }

        const summary = [`Deleted ${deleted}/${leaked.length} session(s).`]
        if (failures.length > 0) {
          summary.push(`${failures.length} failed:`)
          summary.push(...failures.map((line) => `  - ${line}`))
        }
        return summary.join("\n")
      } catch (error) {
        // A listing failure must never be reported as "nothing found" — that
        // would look like success while doing nothing.
        const message = error instanceof Error ? error.message : String(error)
        log("[session-cleanup] failed", { message })
        return `Error: could not list sessions from the OpenCode server: ${message}`
      }
    },
  })
}