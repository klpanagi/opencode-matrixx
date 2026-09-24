// Per-file budget: ≤200 LOC (T9 read-only retrieval helpers, no store writes).
// The predicate lives in `lifecycle.ts` — this module only reads meta files and
// maps the stable meta shape into `RetrievalMeta`, then filters via `isRetrievable`.
import * as fs from "node:fs"
import * as path from "node:path"
import { KNOWLEDGE_KINDS } from "../schema"
import type { KnowledgeKind } from "../types"
import { isRetrievable, type ProposalStatus, type RetrievalMeta, type RetrievalScope } from "./lifecycle"
import { PENDING_DIR, SKILLS_DIR } from "./trace-store"

/** Appended when `get_context` output is cut at the char cap. */
export const CONTEXT_TRUNCATION_MARKER = "\n...[context truncated]"

/** One read-only retrieval candidate: normalized meta + searchable body. */
export type RetrievalRecord = {
  id: string
  meta: RetrievalMeta
  text: string
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value
  }
  return undefined
}

function isKnowledgeKind(value: unknown): value is KnowledgeKind {
  return typeof value === "string" && (KNOWLEDGE_KINDS as readonly string[]).includes(value)
}

/** Map the persisted meta shape (T5/T7/T8) onto the T4a retrieval contract. */
function toRetrievalMeta(raw: unknown): RetrievalMeta | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const status = firstString(record.status) as ProposalStatus | undefined
  const supersededBy = firstString(record.superseded_by)
  const quarantined = record.quarantined === true || status === "quarantined"
  const superseded = record.superseded === true || supersededBy !== undefined || status === "superseded"
  return {
    // Fail-closed: a meta without an explicit status is never retrievable.
    status: status ?? "pending",
    quarantined: quarantined ? true : undefined,
    superseded: superseded ? true : undefined,
    projectId: firstString(record.projectId, record.project_id),
    kind: isKnowledgeKind(record.kind) ? record.kind : undefined,
    tokenCost: typeof record.tokenCost === "number" ? record.tokenCost : undefined,
  }
}

function readTextFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8")
  } catch {
    return ""
  }
}

function readMetaFile(filePath: string): RetrievalMeta | null {
  const content = readTextFile(filePath)
  if (!content) return null
  try {
    return toRetrievalMeta(JSON.parse(content))
  } catch {
    return null
  }
}

function readDirNames(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

/**
 * Enumerate retrieval candidates from the staged skill store and the pending
 * queue. Staged entries win on slug collisions. Read-only; missing dirs → [].
 */
export function readRetrievalRecords(projectRoot: string): RetrievalRecord[] {
  const byId = new Map<string, RetrievalRecord>()

  const pendingDir = path.resolve(projectRoot, PENDING_DIR)
  for (const entry of readDirNames(pendingDir)) {
    if (!entry.isFile() || !entry.name.endsWith(".meta.json")) continue
    const id = entry.name.slice(0, -".meta.json".length)
    const meta = readMetaFile(path.join(pendingDir, entry.name))
    if (meta) byId.set(id, { id, meta, text: readTextFile(path.join(pendingDir, `${id}.md`)) })
  }

  const skillsDir = path.resolve(projectRoot, SKILLS_DIR)
  for (const entry of readDirNames(skillsDir)) {
    if (!entry.isDirectory()) continue
    const meta = readMetaFile(path.join(skillsDir, entry.name, "meta.json"))
    if (meta) byId.set(entry.name, { id: entry.name, meta, text: readTextFile(path.join(skillsDir, entry.name, "SKILL.md")) })
  }

  return [...byId.values()]
}

export type SearchOptions = {
  /** Case-insensitive substring match against id + body. Absent matches all. */
  query?: string
  scope: RetrievalScope
}

/** Filter records through the T4a predicate, then narrow by text match. */
export function searchRecords(records: RetrievalRecord[], options: SearchOptions): RetrievalRecord[] {
  const needle = options.query?.trim().toLowerCase()
  return records
    .filter((record) => isRetrievable(record.meta, options.scope))
    .filter((record) => (needle ? `${record.id} ${record.text}`.toLowerCase().includes(needle) : true))
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** Cut text at `cap` chars, appending the marker only when truncation happens. */
export function truncateContext(text: string, cap: number): string {
  if (text.length <= cap) return text
  return `${text.slice(0, Math.max(0, cap))}${CONTEXT_TRUNCATION_MARKER}`
}
