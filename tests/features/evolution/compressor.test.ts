/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import type { EvolutionConfig } from "../../../src/config/schema/evolution"
import { createCompressor } from "../../../src/features/evolution/compressor"
import { runEvolutionPipeline } from "../../../src/features/evolution/pipeline"
import type { CompressionInput, TraceRecord } from "../../../src/features/evolution/types"

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

function makeInput(count = 6, sessionID = "ses-test"): CompressionInput {
  const traces: TraceRecord[] = []
  for (let i = 0; i < count; i++) traces.push(makeTrace(`t${i}`, true, `ok output ${i}`, i % 2 === 0 ? "read" : "edit"))
  return { sessionID, traces }
}

function stubKnowledgeJSON(): string {
  return JSON.stringify({
    title: "stub-workflow",
    summary: "Stub distilled summary for testing model override threading.",
    patterns: ["Use read successfully"],
    pitfalls: [],
    prerequisites: ["read"],
    confidence: 0.9,
    sourceSessionIDs: ["ses-test"],
  })
}

async function createTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "compressor-test-"))
}

describe("compressor llmCall threading (D1)", () => {
  test("forwards model override to llmCall", async () => {
    //#given a compressor config with a model override
    const config = defaultEvolutionConfig()
    config.compressor.model = "test-provider/test-model"
    let receivedPrompt = ""
    let receivedModel: string | undefined
    //#when compressing with a stubbed llmCall
    const compressor = createCompressor(config.compressor, async (prompt, model) => {
      receivedPrompt = prompt
      receivedModel = model
      return { text: stubKnowledgeJSON() }
    })
    const result = await compressor.compress(makeInput())
    //#then the stub received the configured model id and parsed knowledge
    expect(receivedModel).toBe("test-provider/test-model")
    expect(receivedPrompt.length).toBeGreaterThan(0)
    expect(result.knowledge.title).toBe("stub-workflow")
    expect(result.knowledge.confidence).toBe(0.9)
  })

  test("offline fallback is deterministic without llmCall", async () => {
    //#given a compressor with no llmCall (offline)
    const config = defaultEvolutionConfig()
    const compressor = createCompressor(config.compressor)
    const input = makeInput()
    //#when compressing twice with no network available
    const first = await compressor.compress(input)
    const second = await compressor.compress(input)
    //#then heuristic output is deterministic apart from distilledAt, which is wall-clock by design
    const normalize = (r: typeof first) => ({ ...r.knowledge, distilledAt: "<fixed>" })
    expect(normalize(first)).toEqual(normalize(second))
    expect(first.knowledge.title).toContain("workflow-")
    expect(first.usage).toBeUndefined()
    expect(second.usage).toBeUndefined()
  })

  test("llmCall failure falls back to heuristic", async () => {
    //#given a compressor whose llmCall always throws (host unreachable)
    const config = defaultEvolutionConfig()
    const compressor = createCompressor(config.compressor, async () => {
      throw new Error("host model unreachable")
    })
    //#when compressing
    const result = await compressor.compress(makeInput())
    //#then heuristic output is returned instead of throwing
    expect(result.knowledge.title).toContain("workflow-")
  })

  test("usage shape returned alongside knowledge", async () => {
    //#given a stubbed llmCall that reports usage
    const config = defaultEvolutionConfig()
    const compressor = createCompressor(config.compressor, async () => ({
      text: stubKnowledgeJSON(),
      usage: { inputTokens: 10, outputTokens: 5, costCents: 1 },
    }))
    //#when compressing
    const result = await compressor.compress(makeInput())
    //#then usage is passed through with the stubbed numbers
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, costCents: 1 })
  })

  test("usage estimated when llmCall reports none", async () => {
    //#given a stubbed llmCall with text only
    const config = defaultEvolutionConfig()
    const compressor = createCompressor(config.compressor, async () => ({ text: stubKnowledgeJSON() }))
    //#when compressing
    const result = await compressor.compress(makeInput())
    //#then estimated usage is populated
    expect(result.usage?.inputTokens).toBeGreaterThan(0)
    expect(result.usage?.outputTokens).toBeGreaterThan(0)
    expect(typeof result.usage?.costCents).toBe("number")
  })

  test("dspy-gepa throws explicit not-implemented", () => {
    //#given a dspy-gepa provider config
    const config = defaultEvolutionConfig()
    config.compressor.provider = "dspy-gepa"
    //#when creating the compressor
    //#then an explicit not-implemented error is thrown
    expect(() => createCompressor(config.compressor)).toThrow(/dspy-gepa.*not yet implemented/)
  })

  test("pipeline threads llmCall and returns usage", async () => {
    //#given a tmp project dir and a stubbed llmCall
    const tmpDir = await createTmpDir()
    const origCwd = process.cwd()
    try {
      process.chdir(tmpDir)
      const config = defaultEvolutionConfig()
      let receivedModel: string | undefined
      //#when running the pipeline with the stub
      const result = await runEvolutionPipeline(makeInput(), config, async (prompt, model) => {
        receivedModel = model
        expect(prompt.length).toBeGreaterThan(0)
        return { text: stubKnowledgeJSON(), usage: { inputTokens: 10, outputTokens: 5, costCents: 1 } }
      })
      //#then knowledge is staged and usage flows through
      expect(result.staged).toBeDefined()
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, costCents: 1 })
      expect(receivedModel).toBeUndefined()
    } finally {
      process.chdir(origCwd)
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("pipeline offline heuristic stages when confidence passes", async () => {
    //#given a tmp project dir and no llmCall (offline)
    const tmpDir = await createTmpDir()
    const origCwd = process.cwd()
    try {
      process.chdir(tmpDir)
      const config = defaultEvolutionConfig()
      //#when running the pipeline without llmCall
      const result = await runEvolutionPipeline(makeInput(), config)
      //#then the heuristic path stages knowledge with no usage
      expect(result.staged).toBeDefined()
      expect(result.usage).toBeUndefined()
    } finally {
      process.chdir(origCwd)
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})
