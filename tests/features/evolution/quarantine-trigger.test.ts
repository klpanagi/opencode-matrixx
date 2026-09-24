/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import type { EvolutionConfig } from "../../../src/config/schema/evolution"
import { createEvolutionCompressorHook } from "../../../src/hooks/evolution-compressor"

const SLUG = "idle-low-skill"
const LOW_CONTENT = "x"

function defaultEvolutionConfig(): EvolutionConfig {
  return {
    enabled: true,
    watcher: { maxArgChars: 4000, maxOutputChars: 8000, skipTools: ["evolution-watcher", "evolution-compressor"] },
    compressor: { provider: "llm", minTraces: 999, maxInputTokens: 32000, trigger: "both" },
    writer: { outputDir: ".matrixx/evolution/skills", globalSkills: false, allowToolGeneration: false, allowAgentGeneration: false },
    governance: { requireApproval: true, autoPromote: false, autoPromoteThreshold: 0.85, minConfidence: 0.7 },
    retention: { traceDays: 30, maxPending: 50 },
    budget: { maxCompressionsPerHour: 10, maxCostCentsPerDay: 100 },
  }
}

async function createTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "quarantine-trigger-"))
}

async function exists(p: string): Promise<boolean> {
  return fs.stat(p).then(() => true).catch(() => false)
}

async function seed(tmpDir: string): Promise<void> {
  const staged = path.join(tmpDir, ".matrixx/evolution/skills", SLUG)
  await fs.mkdir(staged, { recursive: true })
  await fs.writeFile(path.join(staged, "SKILL.md"), LOW_CONTENT, "utf-8")
  await fs.writeFile(
    path.join(staged, "meta.json"),
    JSON.stringify(
      {
        name: SLUG,
        version: "1.0.0",
        derived_from: ["ses-a"],
        created_at: new Date().toISOString(),
        confidence: 0.2,
        eval_score: null,
      },
      null,
      2,
    ),
    "utf-8",
  )
  const promoted = path.join(tmpDir, ".opencode/skills", SLUG)
  await fs.mkdir(promoted, { recursive: true })
  await fs.writeFile(path.join(promoted, "SKILL.md"), LOW_CONTENT, "utf-8")
}

describe("evolution idle trigger (T6 production wiring)", () => {
  test("session.idle event invokes the evaluation/quarantine path", async () => {
    //#given
    const tmpDir = await createTmpDir()
    const origCwd = process.cwd()
    try {
      process.chdir(tmpDir)
      await seed(tmpDir)
      const hook = createEvolutionCompressorHook(defaultEvolutionConfig())
      //#when
      await hook.event({ event: { type: "session.idle", properties: { sessionID: "ses-idle" } } })
      //#then
      expect(await exists(path.join(tmpDir, ".matrixx/evolution/quarantine", SLUG, "SKILL.md"))).toBe(true)
      expect(await exists(path.join(tmpDir, ".opencode/skills", SLUG))).toBe(false)
      const audit = await fs.readFile(path.join(tmpDir, ".matrixx/evolution/audit.log"), "utf-8").catch(() => "")
      expect(audit).toContain('"action":"quarantined"')
    } finally {
      process.chdir(origCwd)
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})
