import type { BackgroundTaskStatus } from "./types"

const MAX_ENTRIES_PER_PARENT = 100

// Row cap vs snapshot-retention cap: MAX_ENTRIES_PER_PARENT bounds how many
// history rows are retained per parent (oldest rows evicted on overflow),
// while maxRetained (BuildJobBoardSnapshotOpts) bounds how many rendered
// checkpoint snapshots the caller retains (oldest snapshots evicted). Rows
// always come from getByParentSession — there is no second store.
export type JobBoardStrategy = "latest" | "checkpoint-compatible"

export interface JobBoardRow {
  agent: string
  category?: string
  status: BackgroundTaskStatus
  description: string
  session?: string
}

export interface JobBoardSnapshot {
  strategy: JobBoardStrategy
  block: string
  retained?: string[]
}

export interface BuildJobBoardSnapshotOpts {
  strategy?: JobBoardStrategy
  maxRetained?: number
  previous?: string[]
}

export interface TaskHistoryEntry {
  id: string
  sessionID?: string
  agent: string
  description: string
  status: BackgroundTaskStatus
  category?: string
  startedAt?: Date
  completedAt?: Date
}

export class TaskHistory {
  private entries: Map<string, TaskHistoryEntry[]> = new Map()

  record(parentSessionID: string | undefined, entry: TaskHistoryEntry): void {
    if (!parentSessionID) return

    const list = this.entries.get(parentSessionID) ?? []
    const existing = list.findIndex((e) => e.id === entry.id)

    if (existing !== -1) {
      const current = list[existing]
      list[existing] = {
        ...current,
        ...(entry.sessionID !== undefined ? { sessionID: entry.sessionID } : {}),
        ...(entry.agent !== undefined ? { agent: entry.agent } : {}),
        ...(entry.description !== undefined ? { description: entry.description } : {}),
        ...(entry.status !== undefined ? { status: entry.status } : {}),
        ...(entry.category !== undefined ? { category: entry.category } : {}),
        ...(entry.startedAt !== undefined ? { startedAt: entry.startedAt } : {}),
        ...(entry.completedAt !== undefined ? { completedAt: entry.completedAt } : {}),
      }
    } else {
      if (list.length >= MAX_ENTRIES_PER_PARENT) {
        list.shift()
      }
      list.push({ ...entry })
    }

    this.entries.set(parentSessionID, list)
  }

  getByParentSession(parentSessionID: string): TaskHistoryEntry[] {
    const list = this.entries.get(parentSessionID)
    if (!list) return []
    return list.map((e) => ({ ...e }))
  }

  clearSession(parentSessionID: string): void {
    this.entries.delete(parentSessionID)
  }

  formatForCompaction(parentSessionID: string): string | null {
    const list = this.getByParentSession(parentSessionID)
    if (list.length === 0) return null

    const lines = list.map((e) => {
      const desc = e.description.replace(/[\n\r]+/g, " ").trim()
      const parts = [
        `- **${e.agent}**`,
        e.category ? `[${e.category}]` : null,
        `(${e.status})`,
        `: ${desc}`,
        e.sessionID ? ` | session: \`${e.sessionID}\`` : null,
      ]
      return parts.filter(Boolean).join("")
    })

    return lines.join("\n")
  }

  getJobBoardEntries(parentSessionID: string): JobBoardRow[] {
    return this.getByParentSession(parentSessionID).map((e) => ({
      agent: e.agent,
      ...(e.category !== undefined ? { category: e.category } : {}),
      status: e.status,
      description: e.description.replace(/[\n\r]+/g, " ").trim(),
      ...(e.sessionID !== undefined ? { session: e.sessionID } : {}),
    }))
  }

  buildJobBoardSnapshot(parentSessionID: string, opts?: BuildJobBoardSnapshotOpts): JobBoardSnapshot | null {
    const entries = this.getJobBoardEntries(parentSessionID)
    if (entries.length === 0) return null
    const strategy = opts?.strategy ?? "latest"
    const block = formatJobBoardBlock(entries)
    if (strategy === "latest") return { strategy, block }
    const maxRetained = clampMaxRetainedSnapshots(opts?.maxRetained)
    const retained = [...(opts?.previous ?? []), block].slice(-maxRetained)
    return { strategy, block, retained }
  }
}

function clampMaxRetainedSnapshots(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 20
  return Math.min(100, Math.max(1, Math.floor(value)))
}

function formatJobBoardBlock(entries: JobBoardRow[]): string {
  const lines = entries.map((row) => {
    const parts = [
      `- **${row.agent}**`,
      row.category ? `[${row.category}]` : null,
      `(${row.status})`,
      `: ${row.description}`,
      row.session ? ` | session: \`${row.session}\`` : null,
    ]
    return parts.filter(Boolean).join("")
  })
  return `**Background task board (${entries.length} task${entries.length === 1 ? "" : "s"}):**\n${lines.join("\n")}`
}
