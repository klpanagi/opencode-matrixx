/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { evaluateSkill } from "../../../src/features/evolution/evaluator"
import {
  isRetrievable,
  quarantineSkill,
  restoreFromQuarantine,
} from "../../../src/features/evolution/store/lifecycle"

const SLUG = "low-skill"
const LOW_CONTENT = "x"
const HIGH_CONTENT = `# low-skill\n\nThis summary is definitely longer than twenty characters and describes a workflow.\n\n## Workflow\n- step one do thing\n- step two do other thing\n\n## Pitfalls\n- pitfall one to avoid\n`

async function createTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "quarantine-test-"))
}

function metaFor(slug: string, confidence: number) {
  return {
    name: slug,
    version: "1.0.0",
    derived_from: ["ses-a"],
    created_at: new Date().toISOString(),
    confidence,
    eval_score: null as number | null,
  }
}

async function seedStaged(tmpDir: string, slug: string, content: string, confidence: number): Promise<void> {
  const staged = path.join(tmpDir, ".matrixx/evolution/skills", slug)
  await fs.mkdir(staged, { recursive: true })
  await fs.writeFile(path.join(staged, "SKILL.md"), content, "utf-8")
  await fs.writeFile(path.join(staged, "meta.json"), JSON.stringify(metaFor(slug, confidence), null, 2), "utf-8")
}

async function seedPromoted(tmpDir: string, slug: string, content: string): Promise<void> {
  const promoted = path.join(tmpDir, ".opencode/skills", slug)
  await fs.mkdir(promoted, { recursive: true })
  await fs.writeFile(path.join(promoted, "SKILL.md"), content, "utf-8")
}

async function exists(p: string): Promise<boolean> {
  return fs.stat(p).then(() => true).catch(() => false)
}

async function readAudit(tmpDir: string): Promise<string> {
  try {
    return await fs.readFile(path.join(tmpDir, ".matrixx/evolution/audit.log"), "utf-8")
  } catch {
    return ""
  }
}

describe("quarantine / lifecycle (T6)", () => {
  test("quarantineSkill moves promoted dir to quarantine and writes audit entry", async () => {
    //#given
    const tmpDir = await createTmpDir()
    try {
      await seedPromoted(tmpDir, SLUG, LOW_CONTENT)
      //#when
      const result = await quarantineSkill(SLUG, { projectRoot: tmpDir, reason: "test-reason" })
      //#then
      expect(result.quarantined).toBe(true)
      expect(await exists(path.join(tmpDir, ".opencode/skills", SLUG))).toBe(false)
      expect(await exists(path.join(tmpDir, ".matrixx/evolution/quarantine", SLUG, "SKILL.md"))).toBe(true)
      const audit = await readAudit(tmpDir)
      expect(audit).toContain('"action":"quarantined"')
      expect(audit).toContain("test-reason")
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("quarantined skills are excluded from retrieval", () => {
    //#given
    const flagMeta = { status: "approved" as const, quarantined: true, projectId: "p1" }
    const statusMeta = { status: "quarantined" as const, projectId: "p1" }
    //#when
    const flagResult = isRetrievable(flagMeta, { projectId: "p1" })
    const statusResult = isRetrievable(statusMeta, { projectId: "p1" })
    //#then
    expect(flagResult).toBe(false)
    expect(statusResult).toBe(false)
  })

  test("evaluateSkill quarantines low-eval promoted skill instead of deleting", async () => {
    //#given
    const tmpDir = await createTmpDir()
    try {
      await seedStaged(tmpDir, SLUG, LOW_CONTENT, 0.2)
      await seedPromoted(tmpDir, SLUG, LOW_CONTENT)
      //#when
      const result = await evaluateSkill(SLUG, { threshold: 0.5, projectRoot: tmpDir })
      //#then
      expect(result.demoted).toBe(true)
      expect(await exists(path.join(tmpDir, ".opencode/skills", SLUG))).toBe(false)
      expect(await exists(path.join(tmpDir, ".matrixx/evolution/quarantine", SLUG, "SKILL.md"))).toBe(true)
      expect(await readAudit(tmpDir)).toContain('"action":"quarantined"')
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("re-eval passing restores the skill from quarantine", async () => {
    //#given
    const tmpDir = await createTmpDir()
    try {
      const quarantineDir = path.join(tmpDir, ".matrixx/evolution/quarantine", SLUG)
      await fs.mkdir(quarantineDir, { recursive: true })
      await fs.writeFile(path.join(quarantineDir, "SKILL.md"), HIGH_CONTENT, "utf-8")
      await fs.writeFile(path.join(quarantineDir, "meta.json"), JSON.stringify(metaFor(SLUG, 0.8), null, 2), "utf-8")
      //#when
      const result = await evaluateSkill(SLUG, { threshold: 0.5, projectRoot: tmpDir })
      //#then
      expect(result.score).toBeGreaterThanOrEqual(0.5)
      expect(await exists(path.join(tmpDir, ".opencode/skills", SLUG, "SKILL.md"))).toBe(true)
      expect(await exists(quarantineDir)).toBe(false)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("restoreFromQuarantine returns false when nothing is quarantined", async () => {
    //#given
    const tmpDir = await createTmpDir()
    try {
      //#when
      const restored = await restoreFromQuarantine(SLUG, { projectRoot: tmpDir })
      //#then
      expect(restored).toBe(false)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})
