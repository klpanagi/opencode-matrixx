import type {
  ContextEntry,
  ContextPriority,
  PendingContext,
  RegisterContextOptions,
} from "./types"

const PRIORITY_ORDER: Record<ContextPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
}

const CONTEXT_SEPARATOR = "\n\n---\n\n"

export const MAX_MERGED_CHARS = 6000
export const MAX_PER_SOURCE_CHARS = 2000

function buildTruncationNotice(droppedEntries: number, omittedChars: number): string {
  return `[context truncated: ${droppedEntries} entries dropped, ${omittedChars} chars omitted]`
}

export class ContextCollector {
  private sessions: Map<string, Map<string, ContextEntry>> = new Map()

  register(sessionID: string, options: RegisterContextOptions): void {
    let sessionMap = this.sessions.get(sessionID)
    if (!sessionMap) {
      sessionMap = new Map()
      this.sessions.set(sessionID, sessionMap)
    }
    const key = `${options.source}:${options.id}`

    const entry: ContextEntry = {
      id: options.id,
      source: options.source,
      content: options.content,
      priority: options.priority ?? "normal",
      timestamp: Date.now(),
      metadata: options.metadata,
    }

    sessionMap.set(key, entry)
  }

  getPending(sessionID: string): PendingContext {
    const sessionMap = this.sessions.get(sessionID)

    if (!sessionMap || sessionMap.size === 0) {
      return {
        merged: "",
        entries: [],
        hasContent: false,
      }
    }

    const entries = this.sortEntries([...sessionMap.values()])
    const originalJoinedLength = entries.map((e) => e.content).join(CONTEXT_SEPARATOR).length

    let perSourceOmitted = 0
    const capped = entries.map((entry) => {
      if (entry.content.length <= MAX_PER_SOURCE_CHARS) return entry
      perSourceOmitted += entry.content.length - MAX_PER_SOURCE_CHARS
      return { ...entry, content: entry.content.slice(0, MAX_PER_SOURCE_CHARS) }
    })

    const included: ContextEntry[] = []
    let used = 0
    for (const entry of capped) {
      const add = included.length === 0 ? entry.content.length : CONTEXT_SEPARATOR.length + entry.content.length
      if (used + add > MAX_MERGED_CHARS) break
      included.push(entry)
      used += add
    }

    const droppedEntries = capped.length - included.length
    if (droppedEntries === 0 && perSourceOmitted === 0) {
      const merged = included.map((e) => e.content).join(CONTEXT_SEPARATOR)
      return {
        merged,
        entries: included,
        hasContent: included.length > 0,
      }
    }

    let omittedChars = originalJoinedLength - used
    let notice = buildTruncationNotice(droppedEntries, omittedChars)
    while (
      included.length > 0 &&
      used + CONTEXT_SEPARATOR.length + notice.length > MAX_MERGED_CHARS
    ) {
      const removed = included.pop()
      if (removed) used -= removed.content.length + CONTEXT_SEPARATOR.length
      const dropped = capped.length - included.length
      omittedChars = originalJoinedLength - used
      notice = buildTruncationNotice(dropped, omittedChars)
    }
    const body = included.map((e) => e.content).join(CONTEXT_SEPARATOR)
    const merged = body.length === 0 ? notice : `${body}${CONTEXT_SEPARATOR}${notice}`

    return {
      merged,
      entries: included,
      hasContent: included.length > 0,
    }
  }

  consume(sessionID: string): PendingContext {
    const pending = this.getPending(sessionID)
    this.clear(sessionID)
    return pending
  }

  clear(sessionID: string): void {
    this.sessions.delete(sessionID)
  }

  hasPending(sessionID: string): boolean {
    const sessionMap = this.sessions.get(sessionID)
    return sessionMap !== undefined && sessionMap.size > 0
  }

  private sortEntries(entries: ContextEntry[]): ContextEntry[] {
    return entries.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      return a.timestamp - b.timestamp
    })
  }
}

export const contextCollector = new ContextCollector()
