import * as path from "node:path"
import { z } from "zod"
import { approveHubWrite, HUB_WRITE_APPROVAL_TTL_MS } from "../../hooks/knowledge-hub-guard/approvals"
import type { V2ToolDefinition } from "../../plugin/types"
import { log } from "../../shared/logger"

const HOOK_NAME = "knowledge-hub-guard"

/**
 * `knowledge_hub_confirm` tool — records a user-confirmed override for the
 * knowledge-hub read-only guard.
 *
 * Call this ONLY after the user explicitly approved the write via the
 * question tool. It records a session-scoped approval (default TTL 10 min)
 * for the resolved absolute path, then the agent retries the blocked write
 * and the guard lets it through.
 */
export function createKnowledgeHubConfirmTool(ctx: { directory?: string }): V2ToolDefinition {
  return {
    name: "knowledge_hub_confirm",
    description:
      "Record user confirmation for a knowledge-hub write. Call only after the user " +
      "explicitly approved the write via the question tool. Records a session-scoped " +
      "approval (10 min TTL) for the path, then retry the blocked write.",
    input: z.object({
      path: z
        .string()
        .describe("Hub file or directory the user approved for writing (absolute or relative to the project dir)"),
      sessionID: z
        .string()
        .optional()
        .describe("Session the approval applies to (defaults to the current session)"),
    }),
    async execute(args, context) {
      const raw = args.path as string
      const base = ctx.directory ?? (context as { directory?: string }).directory ?? process.cwd()
      const resolved = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(base, raw)
      const sessionID = (args.sessionID as string | undefined) ?? context.sessionID
      approveHubWrite(sessionID, resolved, HUB_WRITE_APPROVAL_TTL_MS)
      log(`[${HOOK_NAME}] hub write approved by user`, { sessionID, path: resolved })
      return { content: await (`Approved hub write for "${resolved}" in session "${sessionID}" (valid 10 min). Retry the blocked write now.`) }
    },
  }
}
