import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { EvolutionWriterConfig } from "../../config/schema/evolution"
import { PENDING_DIR, SKILLS_DIR, traceStore } from "./store"
import type { DistilledKnowledge, SkillMeta } from "./types"

function slugify(title: string): string {
  const s = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return s || "untitled"
}

function toFrontmatter(meta: SkillMeta): string {
  const lines = [
    "---",
    `name: ${meta.name}`,
    `version: ${meta.version}`,
    `derived_from: [${meta.derived_from.map((d) => `"${d}"`).join(", ")}]`,
    `created_at: ${meta.created_at}`,
    `confidence: ${meta.confidence}`,
    `eval_score: ${meta.eval_score ?? "null"}`,
  ]
  if (meta.tags?.length) lines.push(`tags: [${meta.tags.join(", ")}]`)
  if (meta.prerequisites?.length) lines.push(`prerequisites: [${meta.prerequisites.join(", ")}]`)
  lines.push("---")
  return lines.join("\n")
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

export class EvolutionWriter {
  private pendingDir: string
  private skillsDir: string
  private promotedBase: string
  private globalBase?: string

  constructor(
    config: EvolutionWriterConfig,
    projectRoot: string = process.cwd(),
  ) {
    this.pendingDir = path.resolve(projectRoot, PENDING_DIR)
    this.skillsDir = path.resolve(projectRoot, config.outputDir || SKILLS_DIR)
    this.promotedBase = path.resolve(projectRoot, ".opencode/skills")
    if (config.globalSkills) this.globalBase = path.join(os.homedir(), ".agents/skills")
  }

  async stage(knowledge: DistilledKnowledge): Promise<{ slug: string; pendingPath: string; metaPath: string }> {
    const slug = slugify(knowledge.title)
    const pendingPath = path.join(this.pendingDir, `${slug}.md`)
    const metaPath = path.join(this.pendingDir, `${slug}.meta.json`)
    let version = "1.0.0"
    try {
      const existing = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as SkillMeta
      if (knowledge.confidence < existing.confidence) {
        return { slug, pendingPath, metaPath }
      }
      const parts = existing.version.split(".").map(Number)
      parts[2] += 1
      version = parts.join(".")
    } catch {}
    const meta: SkillMeta = {
      name: slug,
      version,
      derived_from: knowledge.sourceSessionIDs,
      created_at: new Date().toISOString(),
      confidence: knowledge.confidence,
      eval_score: null,
      prerequisites: knowledge.prerequisites,
    }
    const content = `${toFrontmatter(meta)}\n\n${buildBody(knowledge)}\n`
    writeAtomic(pendingPath, content)
    writeAtomic(metaPath, JSON.stringify(meta, null, 2))
    const stagedDir = path.join(this.skillsDir, slug, "versions")
    ensureDir(stagedDir)
    writeAtomic(path.join(this.skillsDir, slug, "SKILL.md"), content)
    writeAtomic(path.join(stagedDir, `${version}.md`), content)
    await traceStore.appendAudit({ action: "staged", slug, version, confidence: knowledge.confidence })
    return { slug, pendingPath, metaPath }
  }

  async promote(slug: string): Promise<{ promotedPath: string }> {
    const pendingPath = path.join(this.pendingDir, `${slug}.md`)
    const metaPath = path.join(this.pendingDir, `${slug}.meta.json`)
    if (!fs.existsSync(pendingPath)) throw new Error(`pending ${slug} not found`)
    const content = fs.readFileSync(pendingPath, "utf-8")
    const dest = path.join(this.promotedBase, slug, "SKILL.md")
    writeAtomic(dest, content)
    if (this.globalBase) writeAtomic(path.join(this.globalBase, slug, "SKILL.md"), content)
    try {
      fs.unlinkSync(pendingPath)
      fs.unlinkSync(metaPath)
    } catch {}
    await traceStore.appendAudit({ action: "promoted", slug })
    return { promotedPath: dest }
  }

  async reject(slug: string): Promise<void> {
    const pendingPath = path.join(this.pendingDir, `${slug}.md`)
    const metaPath = path.join(this.pendingDir, `${slug}.meta.json`)
    try {
      fs.unlinkSync(pendingPath)
    } catch {}
    try {
      fs.unlinkSync(metaPath)
    } catch {}
    await traceStore.appendAudit({ action: "rejected", slug })
  }

  async listPending(): Promise<string[]> {
    try {
      const files = await fs.promises.readdir(this.pendingDir)
      return files.filter((f) => f.endsWith(".md")).map((f) => path.basename(f, ".md"))
    } catch {
      return []
    }
  }

  async listPromoted(): Promise<string[]> {
    try {
      const files = await fs.promises.readdir(this.promotedBase)
      const result: string[] = []
      for (const f of files) {
        try {
          if (fs.statSync(path.join(this.promotedBase, f)).isDirectory()) result.push(f)
        } catch {}
      }
      return result
    } catch {
      return []
    }
  }
}
