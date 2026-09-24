// T7 supersede helpers, split out of writer.ts so stage() stays within the 200-LOC budget.
import { createHash } from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"
import { normalizeKnowledgeKind } from "./schema"
import { normalizeProjectId } from "./store/project-identity"
import type { DistilledKnowledge, KnowledgeKind, SkillMeta } from "./types"

export type SupersedeKey = { baseSlug: string; projectId: string; kind: KnowledgeKind }

/** Stable hash of the distillable payload, ignoring volatile timestamps/provenance. */
export function contentHashFor(knowledge: DistilledKnowledge): string {
  const payload = JSON.stringify({
    title: knowledge.title,
    summary: knowledge.summary,
    patterns: knowledge.patterns,
    pitfalls: knowledge.pitfalls,
    prerequisites: knowledge.prerequisites,
    skillDraft: knowledge.skillDraft ?? null,
  })
  return createHash("sha256").update(payload).digest("hex").slice(0, 8)
}

/** Distinct, deterministic slug for a chain entry so old and new coexist on disk. */
export function chainSlug(baseSlug: string, contentHash: string): string {
  return `${baseSlug}-${contentHash}`
}

/** Return `desired`, or the first free `desired-N` when it is already taken. */
export function uniqueSlug(taken: ReadonlySet<string>, desired: string): string {
  if (!taken.has(desired)) return desired
  let n = 2
  while (taken.has(`${desired}-${n}`)) n += 1
  return `${desired}-${n}`
}

/** Read every pending `*.meta.json`; malformed files are skipped, missing dirs yield []. */
export function listPendingMetas(pendingDir: string): SkillMeta[] {
  let files: string[]
  try {
    files = fs.readdirSync(pendingDir)
  } catch {
    return []
  }
  const metas: SkillMeta[] = []
  for (const file of files) {
    if (!file.endsWith(".meta.json")) continue
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(pendingDir, file), "utf-8")) as SkillMeta
      if (meta && typeof meta.name === "string") metas.push(meta)
    } catch {}
  }
  return metas
}

/** Whether a meta shares the (projectId, kind, normalized title) key of a candidate. */
export function knowledgeKeyMatches(meta: SkillMeta, key: SupersedeKey): boolean {
  if (normalizeProjectId(meta.projectId) !== key.projectId) return false
  if (normalizeKnowledgeKind(meta.kind) !== key.kind) return false
  return (meta.base_slug ?? meta.name) === key.baseSlug
}

/** The live artifact for a key: newest matching meta without `superseded_by`. */
export function findLiveHead(metas: SkillMeta[], key: SupersedeKey): SkillMeta | null {
  const candidates = metas.filter((meta) => knowledgeKeyMatches(meta, key))
  if (candidates.length === 0) return null
  const live = candidates.filter((meta) => !meta.superseded_by)
  const pool = live.length > 0 ? live : candidates
  return (
    pool.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || a.name.localeCompare(b.name))[0] ?? null
  )
}

/** Follow `superseded_by` from `startSlug` to the chain end; fail-open on breaks/cycles. */
export function resolveHeadSlug(metas: SkillMeta[], startSlug: string): string {
  const byName = new Map(metas.map((meta) => [meta.name, meta]))
  let current = startSlug
  const seen = new Set<string>()
  while (!seen.has(current)) {
    seen.add(current)
    const next = byName.get(current)?.superseded_by
    if (!next) return current
    current = next
  }
  return current
}
