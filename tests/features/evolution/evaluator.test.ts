/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { containsSecretForEval, evaluateSkill, readMeta } from "../../../src/features/evolution/evaluator"
import { runEvolutionPipeline } from "../../../src/features/evolution/pipeline"
import type { EvolutionConfig } from "../../../src/config/schema/evolution"
import type { TraceRecord } from "../../../src/features/evolution/types"

async function createTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "eval-test-"))
}

function makeTrace(id: string, success: boolean, output: string, tool = "read"): TraceRecord {
  return {
    id,
    sessionID: "ses-test",
    callID: `call-${id}`,
    timestamp: new Date().toISOString(),
    agent: "test-agent",
    tool,
    args: {},
    output,
    durationMs: 10,
    success,
  }
}

function defaultEvolutionConfig(): EvolutionConfig {
  return {
    enabled: true,
    watcher: { maxArgChars: 4000, maxOutputChars: 8000, skipTools: ["evolution-watcher", "evolution-compressor"] },
    compressor: { provider: "llm", minTraces: 5, maxInputTokens: 32000, trigger: "both" },
    writer: { outputDir: ".matrixx/evolution/skills", globalSkills: false, allowToolGeneration: false, allowAgentGeneration: false },
    governance: { requireApproval: true, autoPromote: false, autoPromoteThreshold: 0.85, minConfidence: 0.7 },
    retention: { traceDays: 30, maxPending: 50 },
    budget: { maxCompressionsPerHour: 10, maxCostCentsPerDay: 100 },
  }
}

describe("evaluator", () => {
  test("high-quality skill returns score >=0.5 not demoted and updates meta", async () => {
    //#given
    const tmpDir = await createTmpDir()
    const slug = "high-quality"
    const skillDir = path.join(tmpDir, ".matrixx/evolution/skills", slug)
    const pendingMeta = path.join(tmpDir, ".matrixx/evolution/pending", `${slug}.meta.json`)
    const pendingDir = path.dirname(pendingMeta)
    try {
      const content = `# high-quality\n\nThis is a summary that is definitely longer than twenty characters and describes workflow.\n\n## Workflow\n- step one do thing\n- step two do other thing\n\n## Pitfalls\n- pitfall one to avoid\n`
      await fs.mkdir(skillDir, { recursive: true })
      await fs.mkdir(pendingDir, { recursive: true })
      await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf-8")
      const meta = { name: slug, version: "1.0.0", derived_from: ["ses-a"], created_at: new Date().toISOString(), confidence: 0.8, eval_score: null as number | null }
      await fs.writeFile(path.join(skillDir, "meta.json"), JSON.stringify(meta, null, 2), "utf-8")
      await fs.writeFile(pendingMeta, JSON.stringify(meta, null, 2), "utf-8")
      const promotedPath = path.join(tmpDir, ".opencode/skills", slug, "SKILL.md")
      await fs.mkdir(path.dirname(promotedPath), { recursive: true })
      await fs.writeFile(promotedPath, content, "utf-8")
      //#when
      const result = await evaluateSkill(slug, { threshold: 0.5, projectRoot: tmpDir })
      //#then
      expect(result.score).toBeGreaterThanOrEqual(0.5)
      expect(result.demoted).toBe(false)
      const updated = await readMeta(slug, tmpDir)
      expect(updated?.eval_score).toBe(result.score)
      const stillExists = await fs.stat(promotedPath).then(() => true).catch(() => false)
      expect(stillExists).toBe(true)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("low-quality empty skill demoted when promoted exists and file removed", async () => {
    //#given
    const tmpDir = await createTmpDir()
    const slug = "low-quality"
    const skillDir = path.join(tmpDir, ".matrixx/evolution/skills", slug)
    try {
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(path.join(skillDir, "SKILL.md"), "x", "utf-8")
      const meta = { name: slug, version: "1.0.0", derived_from: ["ses-a"], created_at: new Date().toISOString(), confidence: 0.2, eval_score: null as number | null }
      await fs.writeFile(path.join(skillDir, "meta.json"), JSON.stringify(meta, null, 2), "utf-8")
      const promotedPath = path.join(tmpDir, ".opencode/skills", slug, "SKILL.md")
      await fs.mkdir(path.dirname(promotedPath), { recursive: true })
      await fs.writeFile(promotedPath, "old content", "utf-8")
      //#when
      const result = await evaluateSkill(slug, { threshold: 0.5, projectRoot: tmpDir })
      //#then
      expect(result.score).toBeLessThan(0.5)
      expect(result.demoted).toBe(true)
      const exists = await fs.stat(promotedPath).then(() => true).catch(() => false)
      expect(exists).toBe(false)
      const updated = await readMeta(slug, tmpDir)
      expect(updated?.eval_score).toBe(result.score)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("secret in skill returns score 0 and demoted", async () => {
    //#given
    const tmpDir = await createTmpDir()
    const slug = "secret-skill"
    const skillDir = path.join(tmpDir, ".matrixx/evolution/skills", slug)
    try {
      await fs.mkdir(skillDir, { recursive: true })
      const secret = "ghp_1234567890123456789012345678901234"
      const content = `# secret-skill\n\nThis is a long summary that passes length check.\n\n## Workflow\n- do secret stuff ${secret}\n\n## Pitfalls\n- none\n`
      await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf-8")
      const meta = { name: slug, version: "1.0.0", derived_from: ["ses-a"], created_at: new Date().toISOString(), confidence: 0.9, eval_score: null as number | null }
      await fs.writeFile(path.join(skillDir, "meta.json"), JSON.stringify(meta, null, 2), "utf-8")
      const promotedPath = path.join(tmpDir, ".opencode/skills", slug, "SKILL.md")
      await fs.mkdir(path.dirname(promotedPath), { recursive: true })
      await fs.writeFile(promotedPath, content, "utf-8")
      //#when
      const result = await evaluateSkill(slug, { threshold: 0.5, projectRoot: tmpDir })
      //#then
      expect(result.score).toBe(0)
      expect(result.demoted).toBe(true)
      expect(containsSecretForEval(secret)).toBe(true)
      const exists = await fs.stat(promotedPath).then(() => true).catch(() => false)
      expect(exists).toBe(false)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("missing slug returns score 0 no throw", async () => {
    //#given
    const tmpDir = await createTmpDir()
    try {
      //#when
      const result = await evaluateSkill("nonexistent", { projectRoot: tmpDir })
      //#then
      expect(result.score).toBe(0)
      expect(result.demoted).toBe(false)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("containsSecretForEval detects all patterns", async () => {
    //#given
    const cases = ["sk-12345678901234567890abcdef", "ghp_1234567890123456789012345678901234", "AKIA1234567890ABCDEF", "-----BEGIN RSA PRIVATE KEY-----", "xoxb-1234567890-abcdef"]
    //#when
    const results = cases.map((c) => containsSecretForEval(c))
    //#then
    for (const r of results) expect(r).toBe(true)
    expect(containsSecretForEval("hello world")).toBe(false)
  })

  test("pipeline integration low confidence knowledge gate-rejected no pending file", async () => {
    //#given
    const tmpDir = await createTmpDir()
    const origCwd = process.cwd()
    try {
      process.chdir(tmpDir)
      const config = defaultEvolutionConfig()
      const traces: TraceRecord[] = []
      traces.push(makeTrace("t1", true, "ok read", "read"))
      for (let i = 2; i <= 5; i++) traces.push(makeTrace(`t${i}`, false, "Error failed", "bash"))
      const input = { sessionID: "ses-low", traces }
      //#when
      const result = await runEvolutionPipeline(input, config)
      //#then
      expect(result.reason).toBeDefined()
      expect(result.staged).toBeUndefined()
      const pendingFiles = await fs.readdir(path.join(tmpDir, ".matrixx/evolution/pending")).then((f) => f).catch(() => [] as string[])
      expect(pendingFiles.length).toBe(0)
    } finally {
      process.chdir(origCwd)
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("pipeline integration secret leak gate-rejected", async () => {
    //#given
    const tmpDir = await createTmpDir()
    const origCwd = process.cwd()
    try {
      process.chdir(tmpDir)
      const config = defaultEvolutionConfig()
      const traces: TraceRecord[] = []
      for (let i = 0; i < 4; i++) traces.push(makeTrace(`t${i}`, true, "ok success", "read"))
      traces.push(makeTrace("t4", false, "failed with ghp_1234567890123456789012345678901234 exposed", "bash"))
      traces.push(makeTrace("t5", true, "ok", "edit"))
      const input = { sessionID: "ses-secret", traces }
      //#when
      const result = await runEvolutionPipeline(input, config)
      //#then
      expect(result.reason).toBeDefined()
      expect(result.staged).toBeUndefined()
      const pendingFiles = await fs.readdir(path.join(tmpDir, ".matrixx/evolution/pending")).then((f) => f).catch(() => [] as string[])
      expect(pendingFiles.length).toBe(0)
    } finally {
      process.chdir(origCwd)
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})
