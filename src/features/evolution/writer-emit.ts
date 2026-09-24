import * as fs from "node:fs"
import * as path from "node:path"
import { log } from "../../shared/logger"
import { containsSecretForEval } from "./evaluator"
import { traceStore } from "./store"
import type { DistilledKnowledge, KnowledgeKind } from "./types"
import { type ProvenanceMeta, toFrontmatter } from "./writer-frontmatter"

export function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return s || "untitled"
}

function buildBody(k: DistilledKnowledge): string {
  if (k.skillDraft) return k.skillDraft
  const parts = [`# ${k.title}`, "", k.summary, ""]
  if (k.patterns.length) parts.push("## Workflow", ...k.patterns.map((p) => `- ${p}`), "")
  if (k.pitfalls.length) parts.push("## Pitfalls", ...k.pitfalls.map((p) => `- ${p}`), "")
  if (k.prerequisites.length) parts.push("## Prerequisites", k.prerequisites.join(", "))
  return parts.join("\n")
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

function writeAtomic(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath))
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, content, "utf-8")
  fs.renameSync(tmp, filePath)
}

export type EmitInput = {
  pendingDir: string
  skillsDir: string
  slug: string
  knowledge: DistilledKnowledge
  projectId: string
  kind: KnowledgeKind
  contentHash: string
  baseSlug: string
}

export async function emitArtifact(input: EmitInput): Promise<{ slug: string; pendingPath: string; metaPath: string }> {
  const { pendingDir, skillsDir, slug, knowledge, projectId, kind, contentHash, baseSlug } = input
  const pendingPath = path.join(pendingDir, `${slug}.md`)
  const metaPath = path.join(pendingDir, `${slug}.meta.json`)
  const createdAt = new Date().toISOString()
  const distilledAt = knowledge.distilledAt?.trim() ? knowledge.distilledAt : createdAt
  if (!knowledge.distilledAt?.trim()) {
    log("[evolution] knowledge missing distilledAt; defaulted to now")
  }
  const traceIds = knowledge.sourceTraceIDs ?? []
  if (!knowledge.sourceTraceIDs) {
    log("[evolution] knowledge missing sourceTraceIDs; defaulted to []")
  }
  const meta: ProvenanceMeta = {
    name: slug,
    version: "1.0.0",
    derived_from: knowledge.sourceSessionIDs,
    created_at: createdAt,
    confidence: knowledge.confidence,
    eval_score: null,
    prerequisites: knowledge.prerequisites,
    kind,
    projectId,
    session_ids: knowledge.sourceSessionIDs,
    trace_ids: traceIds,
    distilled_at: distilledAt,
    base_slug: baseSlug,
    content_hash: contentHash,
  }
  const content = `${toFrontmatter(meta)}\n\n${buildBody(knowledge)}\n`
  if (containsSecretForEval(content)) {
    await traceStore.appendAudit({ action: "secret-blocked", slug })
    throw new Error("potential secret detected in staged skill content")
  }
  writeAtomic(pendingPath, content)
  writeAtomic(metaPath, JSON.stringify(meta, null, 2))
  ensureDir(path.join(skillsDir, slug, "versions"))
  writeAtomic(path.join(skillsDir, slug, "SKILL.md"), content)
  writeAtomic(path.join(skillsDir, slug, "versions", "1.0.0.md"), content)
  await traceStore.appendAudit({ action: "staged", slug, version: "1.0.0", confidence: knowledge.confidence })
  return { slug, pendingPath, metaPath }
}
