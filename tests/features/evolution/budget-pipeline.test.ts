/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as fsp from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import type { EvolutionConfig } from "../../../src/config/schema/evolution"
import { runEvolutionPipeline } from "../../../src/features/evolution/pipeline"
import { budgetPath, EVOLUTION_DIR, loadLedger, utcDayKey } from "../../../src/features/evolution/store"
import type { CompressionInput, TraceRecord } from "../../../src/features/evolution/types"

function makeTrace(id: string): TraceRecord {
  return {
    id,
    sessionID: "ses-budget",
    callID: `call-${id}`,
    timestamp: new Date().toISOString(),
    agent: "test-agent",
    tool: "read",
    args: {},
    output: `ok ${id}`,
    durationMs: 10,
    success: true,
  }
}

function makeInput(count = 6): CompressionInput {
  const traces: TraceRecord[] = []
  for (let i = 0; i < count; i++) traces.push(makeTrace(`t${i}`))
  return { sessionID: "ses-budget", traces }
}

function budgetConfig(): EvolutionConfig {
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

function stubKnowledgeJSON(): string {
  return JSON.stringify({
    title: "budgeted-workflow",
    summary: "Stub distilled summary used for budget enforcement tests.",
    patterns: ["Use read successfully"],
    pitfalls: [],
    prerequisites: ["read"],
    confidence: 0.9,
    sourceSessionIDs: ["ses-budget"],
  })
}

function evolutionDirOf(projectDir: string): string {
  return path.resolve(projectDir, EVOLUTION_DIR)
}

function seedLedger(spendCents: number): void {
  const dir = evolutionDirOf(process.cwd())
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(budgetPath(dir), JSON.stringify({ day: utcDayKey(new Date()), spendCents, events: [] }), "utf-8")
}

let tmpDir: string
let origCwd: string

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "budget-pipeline-test-"))
  origCwd = process.cwd()
  process.chdir(tmpDir)
})

afterEach(async () => {
  process.chdir(origCwd)
  await fsp.rm(tmpDir, { recursive: true, force: true })
})

describe("daily cost cap gate (T3)", () => {
  test("over daily cap blocks the LLM path and still stages heuristic knowledge", async () => {
    //#given a ledger already at the daily cap
    seedLedger(100)
    let llmCalled = false

    //#when running the pipeline with an llmCall stub
    const result = await runEvolutionPipeline(makeInput(), budgetConfig(), async () => {
      llmCalled = true
      return { text: stubKnowledgeJSON() }
    })

    //#then the paid path is skipped, the free heuristic still stages, nothing is charged
    expect(llmCalled).toBe(false)
    expect(result.staged).toBeDefined()
    expect(result.usage).toBeUndefined()
    expect(loadLedger(evolutionDirOf(tmpDir)).spendCents).toBe(100)
  })

  test("under cap invokes the LLM path and records costCents into the ledger (G6)", async () => {
    //#given an empty ledger under the cap
    //#when the stubbed llmCall returns usage of 5 cents
    const result = await runEvolutionPipeline(makeInput(), budgetConfig(), async () => ({
      text: stubKnowledgeJSON(),
      usage: { inputTokens: 10, outputTokens: 5, costCents: 5 },
    }))

    //#then knowledge is staged and the ledger increments by the reported cost
    expect(result.staged).toBeDefined()
    expect(result.usage?.costCents).toBe(5)
    const ledger = loadLedger(evolutionDirOf(tmpDir))
    expect(ledger.spendCents).toBe(5)
    expect(ledger.events).toHaveLength(1)
  })
})

describe("pipeline pending capacity gate (T3)", () => {
  test("early-returns max-pending with an audit and no new pending file", async () => {
    //#given a pending queue at capacity
    const pendingDir = path.resolve(tmpDir, EVOLUTION_DIR, "pending")
    fs.mkdirSync(pendingDir, { recursive: true })
    fs.writeFileSync(path.join(pendingDir, "a.md"), "a", "utf-8")
    fs.writeFileSync(path.join(pendingDir, "b.md"), "b", "utf-8")
    fs.writeFileSync(path.join(pendingDir, "c.md"), "c", "utf-8")
    const config = budgetConfig()
    config.retention.maxPending = 3

    //#when running the pipeline
    const result = await runEvolutionPipeline(makeInput(), config, async () => ({ text: stubKnowledgeJSON() }))

    //#then it short-circuits with an audit and writes nothing new
    expect(result.reason).toBe("max-pending")
    expect(result.staged).toBeUndefined()
    expect(fs.readdirSync(pendingDir).filter((f) => f.endsWith(".md"))).toHaveLength(3)
    const audit = fs.readFileSync(path.resolve(tmpDir, EVOLUTION_DIR, "audit.log"), "utf-8")
    expect(audit).toContain("max-pending")
  })
})
