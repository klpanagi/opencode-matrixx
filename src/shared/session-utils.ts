import type { PluginInput } from "@opencode-ai/plugin"
import { findNearestMessageWithFields, findNearestMessageWithFieldsFromSDK } from "../features/hook-message-injector"
import { getSessionAgent } from "../features/session-state"
import { getAgentConfigKey } from "./agent-display-names"
import { log } from "./logger"
import { getMessageDir } from "./opencode-message-dir"
import { isSqliteBackend } from "./opencode-storage-detection"

export async function isCallerOrchestrator(sessionID?: string, client?: PluginInput["client"]): Promise<boolean> {
  if (!sessionID) return false

  // In-memory session agent is already authoritative for the live session
  // (set by chat.message). Checking it first makes this O(1) for every
  // non-architect agent instead of a full-transcript fetch.
  const knownAgent = getSessionAgent(sessionID)
  if (knownAgent) {
    return getAgentConfigKey(knownAgent) === "architect"
  }

  if (isSqliteBackend() && client) {
    try {
      const nearest = await findNearestMessageWithFieldsFromSDK(client, sessionID)
      return getAgentConfigKey(nearest?.agent ?? "") === "architect"
    } catch (error) {
      log("[session-utils] SDK orchestrator check failed", { sessionID, error: String(error) })
      return false
    }
  }

  const messageDir = getMessageDir(sessionID)
  if (!messageDir) return false
  const nearest = findNearestMessageWithFields(messageDir)
  return getAgentConfigKey(nearest?.agent ?? "") === "architect"
}
