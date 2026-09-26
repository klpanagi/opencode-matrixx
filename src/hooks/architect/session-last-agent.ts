import { findNearestMessageWithFields, findNearestMessageWithFieldsFromSDK } from "../../features/hook-message-injector"
import type { PluginContext } from "../../plugin/types"
import { getMessageDir, isSqliteBackend } from "../../shared"

type OpencodeClient = PluginContext["client"]

export async function getLastAgentFromSession(
  sessionID: string,
  client?: OpencodeClient
): Promise<string | null> {
  let nearest = null

  if (isSqliteBackend() && client) {
    nearest = await findNearestMessageWithFieldsFromSDK(client, sessionID)
  } else {
    const messageDir = getMessageDir(sessionID)
    if (!messageDir) return null
    nearest = findNearestMessageWithFields(messageDir)
  }

  return nearest?.agent?.toLowerCase() ?? null
}
