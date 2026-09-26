import {
  buildSubagentSessionCreate,
  type SessionOps,
  type V1CreateArgs,
} from "../../features/background-agent/session-ops"
import { createV1SessionOps } from "../../features/background-agent/v1-session-ops"
import type { OpencodeClient } from "./types"

export async function createSyncSession(
  client: OpencodeClient,
  input: { parentSessionID: string; agentToUse: string; description: string; defaultDirectory: string },
  sessionOps: SessionOps = createV1SessionOps(
    async (args: V1CreateArgs) => {
      const result = await client.session.create(args)
      return { data: result.data, error: result.error }
    },
    { createErrorPrefix: "Failed to create session" }
  )
): Promise<{ ok: true; sessionID: string; parentDirectory: string } | { ok: false; error: string }> {
  const parentSession = client.session.get
    ? await client.session.get({ path: { id: input.parentSessionID } }).catch(() => null)
    : null
  const parentDirectory = parentSession?.data?.directory ?? input.defaultDirectory

  const created = await sessionOps.create(
    buildSubagentSessionCreate({
      description: input.description,
      agent: input.agentToUse,
      parentSessionID: input.parentSessionID,
      directory: parentDirectory,
    })
  )

  if (!created.ok) {
    return { ok: false, error: created.error }
  }

  return { ok: true, sessionID: created.sessionID, parentDirectory }
}
