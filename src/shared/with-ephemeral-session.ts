import type { createOpencodeClient } from "@opencode-ai/sdk"
import { log } from "./logger"
import { normalizeSDKResponse } from "./normalize-sdk-response"
import { isRecord } from "./record-type-guard"

type Client = ReturnType<typeof createOpencodeClient>

export interface EphemeralSessionOptions<T> {
  client: Client
  directory: string
  title: string
  parentID?: string
  body: (sessionID: string) => Promise<T>
}

function isNotFoundError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? "")
  return text.includes("404")
}

// Runs `body` with a throwaway child session that is always deleted
// afterwards, so idle/compact triggers cannot accumulate rows in the TUI
// session list. Cleanup failures are logged and swallowed; a body failure
// always propagates unchanged from the finally block below.
export async function withEphemeralSession<T>(options: EphemeralSessionOptions<T>): Promise<T> {
  const { client, directory, title, parentID, body } = options
  const created = await client.session.create({
    body: { title, ...(parentID ? { parentID } : {}) },
    query: { directory },
  })
  const session = normalizeSDKResponse<{ id: string }>(created, { id: "" })
  if (!session.id) throw new Error("with-ephemeral-session: host session create failed")
  const sessionID = session.id
  try {
    return await body(sessionID)
  } finally {
    try {
      const result = await client.session.delete({ path: { id: sessionID }, query: { directory } })
      if (isRecord(result) && result.error !== undefined && result.error !== null) {
        if (!isNotFoundError(result.error)) {
          log("[with-ephemeral-session] cleanup delete reported error", { error: String(result.error) })
        }
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        log("[with-ephemeral-session] cleanup delete failed", { error: String(error) })
      }
    }
  }
}
