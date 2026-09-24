import { type KnowledgeKind, type SkillMeta, UNSCOPED_LEGACY } from "./types"

/**
 * Provenance (T8) is the evidence trail behind a generated skill: which
 * sessions and trace rows it was distilled from, and when. It is emitted both
 * as SKILL.md YAML frontmatter and mirrored into meta.json.
 */
export type ProvenanceMeta = SkillMeta & {
  session_ids: string[]
  trace_ids: string[]
  distilled_at: string
}

export type Provenance = {
  session_ids: string[]
  trace_ids: string[]
  project_id: string
  kind: KnowledgeKind
  confidence: number
  distilled_at: string
}

const DEFAULT_KIND: KnowledgeKind = "convention"

/** Legacy artifacts predate provenance; loading them must never throw. */
export function hasProvenance(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false
  const m = meta as Record<string, unknown>
  return Array.isArray(m.session_ids) && Array.isArray(m.trace_ids) && typeof m.distilled_at === "string"
}

export function provenanceOf(meta: ProvenanceMeta): Provenance {
  return {
    session_ids: meta.session_ids,
    trace_ids: meta.trace_ids,
    project_id: meta.projectId ?? UNSCOPED_LEGACY,
    kind: meta.kind ?? DEFAULT_KIND,
    confidence: meta.confidence,
    distilled_at: meta.distilled_at,
  }
}

/** JSON string escapes are valid YAML double-quoted scalars. */
function yamlString(value: string): string {
  return JSON.stringify(value)
}

function yamlList(values: string[]): string {
  return `[${values.map(yamlString).join(", ")}]`
}

export function toFrontmatter(meta: ProvenanceMeta): string {
  const lines = [
    "---",
    `name: ${yamlString(meta.name)}`,
    `version: ${yamlString(meta.version)}`,
    `derived_from: ${yamlList(meta.derived_from)}`,
    `session_ids: ${yamlList(meta.session_ids)}`,
    `trace_ids: ${yamlList(meta.trace_ids)}`,
    `project_id: ${yamlString(meta.projectId ?? UNSCOPED_LEGACY)}`,
    `kind: ${yamlString(meta.kind ?? DEFAULT_KIND)}`,
    `confidence: ${meta.confidence}`,
    `distilled_at: ${yamlString(meta.distilled_at)}`,
    `eval_score: ${meta.eval_score ?? "null"}`,
  ]
  if (meta.tags?.length) lines.push(`tags: ${yamlList(meta.tags)}`)
  if (meta.prerequisites?.length) lines.push(`prerequisites: ${yamlList(meta.prerequisites)}`)
  lines.push("---")
  return lines.join("\n")
}
