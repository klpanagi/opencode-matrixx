import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { MESSAGE_STORAGE, type StoredMessage } from "../hook-message-injector"

const MESSAGE_DIR_CACHE_CAP = 1000
const messageDirCache = new Map<string, string | null>()

function computeMessageDir(sessionID: string): string | null {
  if (!existsSync(MESSAGE_STORAGE)) return null

  const directPath = join(MESSAGE_STORAGE, sessionID)
  if (existsSync(directPath)) return directPath

  for (const dir of readdirSync(MESSAGE_STORAGE)) {
    const sessionPath = join(MESSAGE_STORAGE, dir, sessionID)
    if (existsSync(sessionPath)) return sessionPath
  }
  return null
}

export function getMessageDir(sessionID: string): string | null {
  const cached = messageDirCache.get(sessionID)
  if (cached !== undefined) {
    messageDirCache.delete(sessionID)
    messageDirCache.set(sessionID, cached)
    return cached
  }
  const result = computeMessageDir(sessionID)
  if (messageDirCache.size >= MESSAGE_DIR_CACHE_CAP) {
    const oldest = messageDirCache.keys().next().value
    if (oldest !== undefined) messageDirCache.delete(oldest)
  }
  messageDirCache.set(sessionID, result)
  return result
}

export function _resetMessageDirCacheForTesting(): void {
  messageDirCache.clear()
}

export function isCompactionAgent(agent: string | undefined): boolean {
  return agent?.trim().toLowerCase() === "compaction"
}

function hasFullAgentAndModel(message: StoredMessage): boolean {
  return (
    !!message.agent &&
    !isCompactionAgent(message.agent) &&
    !!message.model?.providerID &&
    !!message.model?.modelID
  )
}

function hasPartialAgentOrModel(message: StoredMessage): boolean {
  const hasAgent = !!message.agent && !isCompactionAgent(message.agent)
  const hasModel = !!message.model?.providerID && !!message.model?.modelID
  return hasAgent || hasModel
}

export function findNearestMessageExcludingCompaction(
  messageDir: string,
): StoredMessage | null {
  try {
    const files = readdirSync(messageDir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .reverse()

    // Single-pass: read+parse each file exactly once. The Map caches parsed
    // data so the "full" and "partial" classification passes don't each
    // re-read the same file (was 2× per file, see B2 in
    // .matrixx/plans/matrixx-performance-optimization.md).
    const parsedByFile = new Map<string, StoredMessage>()

    for (const file of files) {
      try {
        const content = readFileSync(join(messageDir, file), "utf-8")
        const parsed = JSON.parse(content) as StoredMessage
        parsedByFile.set(file, parsed)
        if (hasFullAgentAndModel(parsed)) {
          return parsed
        }
      } catch {
        // unreadable / unparseable file: skip and let later files decide
      }
    }

    for (const parsed of parsedByFile.values()) {
      if (hasPartialAgentOrModel(parsed)) {
        return parsed
      }
    }

    return null
  } catch {
    return null
  }
}
