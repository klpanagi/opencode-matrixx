import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import type { MatrixxConfig } from "../../config/schema"
import { readSessionTasks } from "../../features/task-session-scope"
import { normalizeSDKResponse } from "../../shared"
import { getMessageDir } from "../../shared/opencode-message-dir"
import { isSqliteBackend } from "../../shared/opencode-storage-detection"
import { MESSAGE_STORAGE, PART_STORAGE, SESSION_STORAGE, TRANSCRIPT_DIR } from "./constants"
import type { SessionInfo, SessionMessage, SessionMetadata, TodoItem } from "./types"

interface GetMainSessionsOptions {
  directory?: string
}

// SDK client reference for beta mode
let sdkClient: PluginInput["client"] | null = null

let storageDirectory: string | undefined

let pluginConfig: Partial<MatrixxConfig> | undefined

export function setStorageClient(client: PluginInput["client"]): void {
  sdkClient = client
}

export function resetStorageClient(): void {
  sdkClient = null
}

/**
 * Thread `ctx.directory` into the storage layer. `createSessionManagerTools` is the
 * single construction point of this module, so the directory is held in a module
 * setter for the same reason the SDK client is: `getSessionInfo` is a second
 * consumer of the task read and has no directory of its own, so an explicit
 * parameter would have to be threaded through both public signatures. Passing no
 * directory makes the task store resolve to its global default, matching
 * `getTaskDir`'s own contract when `directory` is omitted; this function needs a
 * concrete string, so an unset directory falls back to `process.cwd()` exactly as
 * `getTaskDir` does for a relative `storage_path`.
 */
export function setStorageDirectory(directory: string | undefined): void {
  storageDirectory = directory
}

/**
 * Thread the plugin config into the task read, for the same reason as the directory:
 * `getSessionInfo` is a second consumer of `readSessionTodos` and carries neither a
 * config nor a directory of its own. Without it the read always resolves the
 * `process.cwd()`-relative project store, which silently returns nothing for a user
 * who configured `tasks.storage_path` or `tasks.scope: "global"` — the `include_todos`
 * diagnostic would be permanently empty for exactly those users.
 */
export function setStorageConfig(config: Partial<MatrixxConfig> | undefined): void {
  pluginConfig = config
}

export async function getMainSessions(options: GetMainSessionsOptions): Promise<SessionMetadata[]> {
  // Beta mode: use SDK
  if (isSqliteBackend() && sdkClient) {
    try {
      const response = await sdkClient.session.list()
      const sessions = normalizeSDKResponse(response, [] as SessionMetadata[])
      const mainSessions = sessions.filter((s) => !s.parentID)
      if (options.directory) {
        return mainSessions
          .filter((s) => s.directory === options.directory)
          .sort((a, b) => b.time.updated - a.time.updated)
      }
      return mainSessions.sort((a, b) => b.time.updated - a.time.updated)
    } catch {
      return []
    }
  }

  // Stable mode: use JSON files
  if (!existsSync(SESSION_STORAGE)) return []

  const sessions: SessionMetadata[] = []

  try {
    const projectDirs = await readdir(SESSION_STORAGE, { withFileTypes: true })
    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue

      const projectPath = join(SESSION_STORAGE, projectDir.name)
      const sessionFiles = await readdir(projectPath)

      for (const file of sessionFiles) {
        if (!file.endsWith(".json")) continue

        try {
          const content = await readFile(join(projectPath, file), "utf-8")
          const meta = JSON.parse(content) as SessionMetadata

          if (meta.parentID) continue

          if (options.directory && meta.directory !== options.directory) continue

          sessions.push(meta)
        } catch {
        }
      }
    }
  } catch {
    return []
  }

  return sessions.sort((a, b) => b.time.updated - a.time.updated)
}

export async function getAllSessions(): Promise<string[]> {
  // Beta mode: use SDK
  if (isSqliteBackend() && sdkClient) {
    try {
      const response = await sdkClient.session.list()
      const sessions = normalizeSDKResponse(response, [] as SessionMetadata[])
      return sessions.map((s) => s.id)
    } catch {
      return []
    }
  }

  // Stable mode: use JSON files
  if (!existsSync(MESSAGE_STORAGE)) return []

  const sessions: string[] = []

  async function scanDirectory(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sessionPath = join(dir, entry.name)
          const files = await readdir(sessionPath)
          if (files.some((f) => f.endsWith(".json"))) {
            sessions.push(entry.name)
          } else {
            await scanDirectory(sessionPath)
          }
        }
      }
    } catch {
      return
    }
  }

  await scanDirectory(MESSAGE_STORAGE)
  return [...new Set(sessions)]
}

export { getMessageDir } from "../../shared/opencode-message-dir"

export async function sessionExists(sessionID: string): Promise<boolean> {
  if (isSqliteBackend() && sdkClient) {
    const response = await sdkClient.session.list()
    const sessions = normalizeSDKResponse(response, [] as Array<{ id?: string }>)
    return sessions.some((s) => s.id === sessionID)
  }
  return getMessageDir(sessionID) !== null
}

export async function readSessionMessages(sessionID: string): Promise<SessionMessage[]> {
  // Beta mode: use SDK
  if (isSqliteBackend() && sdkClient) {
    try {
      const response = await sdkClient.session.messages({ path: { id: sessionID } })
      const rawMessages = normalizeSDKResponse(response, [] as Array<{
        info?: {
          id?: string
          role?: string
          agent?: string
          time?: { created?: number; updated?: number }
        }
        parts?: Array<{
          id?: string
          type?: string
          text?: string
          thinking?: string
          tool?: string
          callID?: string
          input?: Record<string, unknown>
          output?: string
          error?: string
        }>
      }>)
      const messages: SessionMessage[] = rawMessages
        .filter((m) => m.info?.id)
        .map((m) => ({
          id: m.info?.id as string,
          role: (m.info?.role as "user" | "assistant") || "user",
          agent: m.info?.agent,
          time: m.info?.time?.created
            ? {
                created: m.info?.time.created,
                updated: m.info?.time.updated,
              }
            : undefined,
          parts:
            m.parts?.map((p) => ({
              id: p.id || "",
              type: p.type || "text",
              text: p.text,
              thinking: p.thinking,
              tool: p.tool,
              callID: p.callID,
              input: p.input,
              output: p.output,
              error: p.error,
            })) || [],
        }))
      return messages.sort((a, b) => {
        const aTime = a.time?.created ?? 0
        const bTime = b.time?.created ?? 0
        if (aTime !== bTime) return aTime - bTime
        return a.id.localeCompare(b.id)
      })
    } catch {
      return []
    }
  }

  // Stable mode: use JSON files
  const messageDir = getMessageDir(sessionID)
  if (!messageDir || !existsSync(messageDir)) return []

  const messages: SessionMessage[] = []
  try {
    const files = await readdir(messageDir)
    for (const file of files) {
      if (!file.endsWith(".json")) continue
      try {
        const content = await readFile(join(messageDir, file), "utf-8")
        const meta = JSON.parse(content)

        const parts = await readParts(meta.id)

        messages.push({
          id: meta.id,
          role: meta.role,
          agent: meta.agent,
          time: meta.time,
          parts,
        })
      } catch {
      }
    }
  } catch {
    return []
  }

  return messages.sort((a, b) => {
    const aTime = a.time?.created ?? 0
    const bTime = b.time?.created ?? 0
    if (aTime !== bTime) return aTime - bTime
    return a.id.localeCompare(b.id)
  })
}

async function readParts(messageID: string): Promise<Array<{ id: string; type: string; [key: string]: unknown }>> {
  const partDir = join(PART_STORAGE, messageID)
  if (!existsSync(partDir)) return []

  const parts: Array<{ id: string; type: string; [key: string]: unknown }> = []
  try {
    const files = await readdir(partDir)
    for (const file of files) {
      if (!file.endsWith(".json")) continue
      try {
        const content = await readFile(join(partDir, file), "utf-8")
        parts.push(JSON.parse(content))
      } catch {
      }
    }
  } catch {
    return []
  }

  return parts.sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Task status -> todo status. `TaskStatusSchema` spells the terminal removal state
 * `deleted`; `TodoItem` spells it `cancelled`. The two are not assignable, so the
 * value is translated here rather than bridged with a cast or a widened type.
 */
function toTodoStatus(status: "pending" | "in_progress" | "completed" | "deleted"): TodoItem["status"] {
  return status === "deleted" ? "cancelled" : status
}

/**
 * Read the file-backed task store for one session. Replaces the legacy read of
 * OpenCode's own todo state, which had two branches: the SDK endpoint and a "stable
 * mode" scan of OpenCode's on-disk todo directory. Both are gone.
 *
 * There is deliberately no `isSqliteBackend()` split here, unlike the message and
 * session readers in this file. That distinction exists because those endpoints
 * differ per backend; the task store is a plugin-owned local directory, so it is
 * backend-independent and one read covers both. Do not "restore" the branch.
 *
 * Fails open via `readSessionTasks`: a missing store or an unreadable file yields
 * `[]` rather than throwing, matching the contract of the reads it replaces.
 */
export async function readSessionTodos(sessionID: string): Promise<TodoItem[]> {
  return readSessionTasks({
    config: pluginConfig,
    directory: storageDirectory ?? process.cwd(),
    sessionID,
  }).map((task) => ({
    id: task.id,
    content: task.subject,
    status: toTodoStatus(task.status),
  }))
}

 async function readSessionTranscript(sessionID: string): Promise<number> {
  if (!existsSync(TRANSCRIPT_DIR)) return 0

  const transcriptFile = join(TRANSCRIPT_DIR, `${sessionID}.jsonl`)
  if (!existsSync(transcriptFile)) return 0

  try {
    const content = await readFile(transcriptFile, "utf-8")
    return content.trim().split("\n").filter(Boolean).length
  } catch {
    return 0
  }
}

export async function getSessionInfo(sessionID: string): Promise<SessionInfo | null> {
  const messages = await readSessionMessages(sessionID)
  if (messages.length === 0) return null

  const agentsUsed = new Set<string>()
  let firstMessage: Date | undefined
  let lastMessage: Date | undefined

  for (const msg of messages) {
    if (msg.agent) agentsUsed.add(msg.agent)
    if (msg.time?.created) {
      const date = new Date(msg.time.created)
      if (!firstMessage || date < firstMessage) firstMessage = date
      if (!lastMessage || date > lastMessage) lastMessage = date
    }
  }

  const todos = await readSessionTodos(sessionID)
  const transcriptEntries = await readSessionTranscript(sessionID)

  return {
    id: sessionID,
    message_count: messages.length,
    first_message: firstMessage,
    last_message: lastMessage,
    agents_used: Array.from(agentsUsed),
    has_todos: todos.length > 0,
    has_transcript: transcriptEntries > 0,
    todos,
    transcript_entries: transcriptEntries,
  }
}
