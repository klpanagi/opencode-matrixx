import * as fs from "node:fs"
import * as path from "node:path"
import { EVOLUTION_DIR, PENDING_DIR, quarantineSkill, restoreFromQuarantine, SKILLS_DIR, traceStore } from "./store"
import type { SkillMeta } from "./types"

const SECRET_PATTERNS = [/sk-[a-zA-Z0-9]{20,}/, /ghp_[a-zA-Z0-9]{30,}/, /AKIA[0-9A-Z]{16}/, /-----BEGIN .*PRIVATE KEY-----/, /xox[bpras]-[0-9A-Za-z-]+/]
export function containsSecretForEval(text: string): boolean {
  for (const re of SECRET_PATTERNS) if (re.test(text)) return true
  return false
}
export type EvalResult = { score: number; demoted: boolean }
export async function readMeta(slug: string, projectRoot = process.cwd()): Promise<SkillMeta | null> {
  const candidates = [
    path.resolve(projectRoot, SKILLS_DIR, slug, "meta.json"),
    path.resolve(projectRoot, PENDING_DIR, `${slug}.meta.json`),
    path.resolve(projectRoot, EVOLUTION_DIR, "quarantine", slug, "meta.json"),
  ]
  for (const p of candidates) {
    try {
      const raw = await fs.promises.readFile(p, "utf-8")
      return JSON.parse(raw) as SkillMeta
    } catch {}
  }
  return null
}
async function readSkillContent(slug: string, projectRoot: string): Promise<string | null> {
  const candidates = [
    path.resolve(projectRoot, SKILLS_DIR, slug, "SKILL.md"),
    path.resolve(projectRoot, ".opencode/skills", slug, "SKILL.md"),
    path.resolve(projectRoot, EVOLUTION_DIR, "quarantine", slug, "SKILL.md"),
  ]
  for (const p of candidates) {
    try {
      return await fs.promises.readFile(p, "utf-8")
    } catch {}
  }
  return null
}
async function writeMeta(slug: string, projectRoot: string, meta: SkillMeta): Promise<void> {
  const candidates = [path.resolve(projectRoot, SKILLS_DIR, slug, "meta.json"), path.resolve(projectRoot, PENDING_DIR, `${slug}.meta.json`)]
  let target = candidates[0] as string
  for (const p of candidates) {
    try {
      await fs.promises.access(p)
      target = p
      break
    } catch {}
  }
  await fs.promises.mkdir(path.dirname(target), { recursive: true })
  const tmp = `${target}.tmp`
  await fs.promises.writeFile(tmp, JSON.stringify(meta, null, 2), "utf-8")
  await fs.promises.rename(tmp, target)
}
export async function evaluateSkill(slug: string, opts?: { threshold?: number; projectRoot?: string }): Promise<EvalResult> {
  const threshold = opts?.threshold ?? 0.5
  const projectRoot = opts?.projectRoot ?? process.cwd()
  try {
    const meta = await readMeta(slug, projectRoot)
    const content = await readSkillContent(slug, projectRoot)
    let score = 0
    if (content === null) score = 0
    else if (containsSecretForEval(content)) score = 0
    else {
      const patternsCount = (content.match(/^- /gm) ?? []).length
      const hasTitle = slug.trim().length > 0 && content.trim().length > 0
      const summaryLen = content.trim().length
      const hasPitfalls = /pitfall/i.test(content)
      if (hasTitle && summaryLen > 20 && patternsCount > 0) {
        score = 0.7 + Math.min(0.2, 0.1 * patternsCount)
        if (hasPitfalls) score += 0.05
      } else score = 0
      if (meta && typeof meta.confidence === "number") {
        const c = Math.max(0.3, Math.min(1, meta.confidence))
        score = Math.min(1, Math.max(score, score * 0.7 + c * 0.3))
      }
      score = Math.max(0, Math.min(1, score))
    }
    const promotedPath = path.resolve(projectRoot, ".opencode/skills", slug, "SKILL.md")
    let promotedExists = false
    try {
      await fs.promises.access(promotedPath)
      promotedExists = true
    } catch {}
    if (score < threshold) {
      if (promotedExists) {
        try {
          await quarantineSkill(slug, {
            projectRoot,
            sourceDir: path.dirname(promotedPath),
            reason: `low-eval ${score.toFixed(3)} < ${threshold}`,
          })
        } catch {}
      } else {
        try { await traceStore.appendAudit({ action: "demoted", slug, score, threshold }) } catch {}
      }
      if (meta) {
        const next: SkillMeta = { ...meta, eval_score: score }
        try { await writeMeta(slug, projectRoot, next) } catch {}
      }
      return { score, demoted: promotedExists }
    }
    try { await restoreFromQuarantine(slug, { projectRoot }) } catch {}
    if (meta) {
      const next: SkillMeta = { ...meta, eval_score: score }
      try { await writeMeta(slug, projectRoot, next) } catch {}
    }
    try { await traceStore.appendAudit({ action: "evaluated", slug, score }) } catch {}
    return { score, demoted: false }
  } catch {
    return { score: 0, demoted: false }
  }
}

async function listPromotedEvolutionSlugs(projectRoot: string): Promise<string[]> {
  const stagedDir = path.resolve(projectRoot, SKILLS_DIR)
  let entries: string[]
  try {
    entries = await fs.promises.readdir(stagedDir)
  } catch {
    return []
  }
  const promotedRoot = path.resolve(projectRoot, ".opencode/skills")
  const slugs: string[] = []
  for (const entry of entries) {
    try {
      const stat = await fs.promises.stat(path.join(stagedDir, entry))
      if (!stat.isDirectory()) continue
      await fs.promises.access(path.join(promotedRoot, entry))
      slugs.push(entry)
    } catch {}
  }
  return slugs
}

export type EvaluationSweepResult = { evaluated: string[]; demoted: string[] }

/** Evaluate every promoted evolution skill (demoting/quarantining low scorers). Safe to call on session idle. */
export async function evaluatePromotedSkills(opts?: {
  threshold?: number
  projectRoot?: string
  slugs?: string[]
}): Promise<EvaluationSweepResult> {
  const projectRoot = opts?.projectRoot ?? process.cwd()
  const slugs = opts?.slugs ?? (await listPromotedEvolutionSlugs(projectRoot))
  const evaluated: string[] = []
  const demoted: string[] = []
  for (const slug of slugs) {
    try {
      const result = await evaluateSkill(slug, { threshold: opts?.threshold, projectRoot })
      evaluated.push(slug)
      if (result.demoted) demoted.push(slug)
    } catch {}
  }
  return { evaluated, demoted }
}
