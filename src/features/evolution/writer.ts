import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { EvolutionWriterConfig } from "../../config/schema/evolution"
import { log } from "../../shared/logger"
import { normalizeKnowledgeKind } from "./schema"
import {
  normalizeProjectId,
  PENDING_DIR,
  projectSlugSuffix,
  SKILLS_DIR,
  supersedeSkill,
  traceStore,
} from "./store"
import type { DistilledKnowledge, SkillMeta } from "./types"
import { emitArtifact, slugify } from "./writer-emit"
import { hasProvenance } from "./writer-frontmatter"
import {
  chainSlug,
  contentHashFor,
  findLiveHead,
  listPendingMetas,
  resolveHeadSlug,
  uniqueSlug,
} from "./writer-supersede"

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
  private projectRoot: string

  constructor(
    config: EvolutionWriterConfig,
    projectRoot: string = process.cwd(),
  ) {
    this.projectRoot = projectRoot
    this.pendingDir = path.resolve(projectRoot, PENDING_DIR)
    this.skillsDir = path.resolve(projectRoot, config.outputDir || SKILLS_DIR)
    this.promotedBase = path.resolve(projectRoot, ".opencode/skills")
    if (config.globalSkills) this.globalBase = path.join(os.homedir(), ".agents/skills")
  }

  private readMeta(slug: string): SkillMeta | null {
    try {
      const raw = fs.readFileSync(path.join(this.pendingDir, `${slug}.meta.json`), "utf-8")
      const meta = JSON.parse(raw) as SkillMeta
      if (!hasProvenance(meta)) {
        log(`[evolution] legacy meta ${slug} missing provenance; loading fail-open`)
      }
      return meta
    } catch {
      return null
    }
  }

  private async emit(
    slug: string,
    knowledge: DistilledKnowledge,
    projectId: string,
    kind: ReturnType<typeof normalizeKnowledgeKind>,
    contentHash: string,
    baseSlug: string,
  ): Promise<{ slug: string; pendingPath: string; metaPath: string }> {
    return emitArtifact({
      pendingDir: this.pendingDir,
      skillsDir: this.skillsDir,
      slug,
      knowledge,
      projectId,
      kind,
      contentHash,
      baseSlug,
    })
  }

  async stage(
    knowledge: DistilledKnowledge,
  ): Promise<{ slug: string; pendingPath: string; metaPath: string; deduped?: boolean }> {
    const baseSlug = slugify(knowledge.title)
    const projectId = normalizeProjectId(knowledge.projectId)
    const kind = normalizeKnowledgeKind(knowledge.kind)
    const contentHash = contentHashFor(knowledge)
    const metas = listPendingMetas(this.pendingDir)
    const liveHead = findLiveHead(metas, { baseSlug, projectId, kind })

    if (liveHead) {
      if (liveHead.content_hash !== undefined && liveHead.content_hash !== contentHash) {
        const taken = new Set(metas.map((meta) => meta.name))
        const nextSlug = uniqueSlug(taken, chainSlug(baseSlug, contentHash))
        const written = await this.emit(nextSlug, knowledge, projectId, kind, contentHash, baseSlug)
        await supersedeSkill(liveHead.name, { projectRoot: this.projectRoot, supersededBy: nextSlug })
        return written
      }
      await traceStore.appendAudit({ action: "dedup-suppressed", slug: liveHead.name, projectId })
      return {
        slug: liveHead.name,
        pendingPath: path.join(this.pendingDir, `${liveHead.name}.md`),
        metaPath: path.join(this.pendingDir, `${liveHead.name}.meta.json`),
        deduped: true,
      }
    }

    const taken = new Set(metas.map((meta) => meta.name))
    const baseMeta = this.readMeta(baseSlug)
    let slug =
      baseMeta && normalizeProjectId(baseMeta.projectId) !== projectId
        ? `${baseSlug}-${projectSlugSuffix(projectId)}`
        : baseSlug
    if (taken.has(slug)) slug = chainSlug(baseSlug, contentHash)
    slug = uniqueSlug(taken, slug)
    return this.emit(slug, knowledge, projectId, kind, contentHash, baseSlug)
  }

  async promote(slug: string): Promise<{ promotedPath: string }> {
    const headSlug = resolveHeadSlug(listPendingMetas(this.pendingDir), slug)
    const headPath = path.join(this.pendingDir, `${headSlug}.md`)
    const effective = fs.existsSync(headPath) ? headSlug : slug
    const pendingPath = path.join(this.pendingDir, `${effective}.md`)
    const metaPath = path.join(this.pendingDir, `${effective}.meta.json`)
    if (!fs.existsSync(pendingPath)) throw new Error(`pending ${effective} not found`)
    const content = fs.readFileSync(pendingPath, "utf-8")
    const dest = path.join(this.promotedBase, effective, "SKILL.md")
    writeAtomic(dest, content)
    if (this.globalBase) writeAtomic(path.join(this.globalBase, effective, "SKILL.md"), content)
    try {
      fs.unlinkSync(pendingPath)
      fs.unlinkSync(metaPath)
    } catch {}
    await traceStore.appendAudit({ action: "promoted", slug: effective })
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
