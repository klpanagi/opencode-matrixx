/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import type { EvolutionConfig } from "../../../src/config/schema/evolution"
import { createCompressor } from "../../../src/features/evolution/compressor"
import { KnowledgeKindSchema, normalizeKnowledgeKind } from "../../../src/features/evolution/schema"
import type { CompressionInput, TraceRecord } from "../../../src/features/evolution/types"
import { EvolutionWriter } from "../../../src/features/evolution/writer"

function makeTrace(id: string, success: boolean, output: string, tool = "read", errorType?: string): TraceRecord {
  return {
    id,
    sessionID: "ses-kind",
    callID: `call-${id}`,
    timestamp: new Date().toISOString(),
    agent: "test-agent",
    tool,
    args: {},
    output,
    durationMs: 10,
    success,
    ...(errorType ? { errorType } : {}),
  }
}

function makeInput(traces: TraceRecord[], sessionID = "ses-kind"): CompressionInput {
  return { sessionID, traces }
}

function okTrace(id: string, tool = "read"): TraceRecord {
  return makeTrace(id, true, `ok output ${id}`, tool)
}

function failTrace(id: string, tool = "edit", errorType = "runtime"): TraceRecord {
  return makeTrace(id, false, `boom ${id}`, tool, errorType)
}

function defaultCompressorConfig(): EvolutionConfig["compressor"] {
  return { provider: "llm", minTraces: 5, maxInputTokens: 32000, trigger: "both" }
}

describe("D5 knowledge kinds", () => {
  test("accepts the 5 known kinds, rejects a 6th", () => {
    //#given the five typed knowledge kinds
    const kinds = ["workflow", "correction", "debugging_pattern", "gotcha", "convention"]

    //#when parsing each via the Zod data schema
    const accepted = kinds.map((k) => KnowledgeKindSchema.safeParse(k).success)

    //#then all five pass and an unknown sixth is rejected
    expect(accepted).toEqual([true, true, true, true, true])
    expect(KnowledgeKindSchema.safeParse("insight").success).toBe(false)
  })

  test("missing kind in stored JSON loads as convention fail-open", () => {
    //#given stored JSON without a kind field
    const stored = { title: "t", summary: "s" }

    //#when normalizing the absent kind
    const kind = normalizeKnowledgeKind((stored as { kind?: unknown }).kind)

    //#then it fails open to convention instead of throwing
    expect(kind).toBe("convention")
    expect(normalizeKnowledgeKind("bogus-kind")).toBe("convention")
    expect(normalizeKnowledgeKind("workflow")).toBe("workflow")
  })

  test("heuristic kind assignment is deterministic", async () => {
    //#given an offline compressor and a fixed mixed trace set
    const compressor = createCompressor(defaultCompressorConfig())
    const input = makeInput([failTrace("a"), failTrace("b"), okTrace("c"), okTrace("d"), okTrace("e"), okTrace("f")])

    //#when compressing the same input twice with no llmCall
    const first = await compressor.compress(input)
    const second = await compressor.compress(input)

    //#then the same kind is assigned both times
    expect(first.knowledge.kind).toBe(second.knowledge.kind)
    expect(first.knowledge.kind).toBe("debugging_pattern")
  })

  test("heuristic kind matrix covers all five kinds", async () => {
    //#given an offline compressor
    const compressor = createCompressor(defaultCompressorConfig())

    //#when compressing representative trace shapes
    const clean = await compressor.compress(makeInput([okTrace("1"), okTrace("2"), okTrace("3"), okTrace("4"), okTrace("5"), okTrace("6")]))
    const recovered = await compressor.compress(makeInput([failTrace("1"), failTrace("2"), okTrace("3"), okTrace("4"), okTrace("5"), okTrace("6")]))
    const unresolved = await compressor.compress(makeInput([okTrace("1"), failTrace("2"), okTrace("3"), failTrace("4"), okTrace("5"), failTrace("6")]))
    const allFailed = await compressor.compress(makeInput([failTrace("1"), failTrace("2"), failTrace("3"), failTrace("4"), failTrace("5"), failTrace("6")]))
    const thin = await compressor.compress(makeInput([okTrace("1")]))

    //#then each shape maps to its deterministic kind
    expect(clean.knowledge.kind).toBe("workflow")
    expect(recovered.knowledge.kind).toBe("debugging_pattern")
    expect(unresolved.knowledge.kind).toBe("correction")
    expect(allFailed.knowledge.kind).toBe("gotcha")
    expect(thin.knowledge.kind).toBe("convention")
  })

  test("llm prompt instructs one-kind-per-item and parser falls back on unknown kind", async () => {
    //#given a stubbed llmCall returning an unknown kind
    let receivedPrompt = ""
    const compressor = createCompressor(defaultCompressorConfig(), async (prompt) => {
      receivedPrompt = prompt
      return JSON.stringify({
        title: "stub",
        summary: "stub summary",
        patterns: [],
        pitfalls: [],
        prerequisites: [],
        confidence: 0.8,
        sourceSessionIDs: ["ses-kind"],
        kind: "not-a-kind",
      })
    })
    const input = makeInput([failTrace("1"), okTrace("2"), okTrace("3"), okTrace("4"), okTrace("5"), okTrace("6")])

    //#when compressing
    const result = await compressor.compress(input)

    //#then the prompt names the kind vocabulary and the unknown kind never throws
    expect(receivedPrompt).toContain("debugging_pattern")
    expect(receivedPrompt).toContain("kind")
    expect(result.knowledge.kind).toBe("debugging_pattern")
  })

  test("writer persists kind to meta.json", async () => {
    //#given a tmp project dir and knowledge with a kind
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kinds-test-"))
    const origCwd = process.cwd()
    try {
      process.chdir(tmpDir)
      const writer = new EvolutionWriter({ outputDir: ".matrixx/evolution/skills", globalSkills: false, allowToolGeneration: false, allowAgentGeneration: false })
      const knowledge = {
        title: "kind-persisted",
        summary: "summary",
        patterns: ["p"],
        pitfalls: [],
        prerequisites: [],
        confidence: 0.8,
        sourceSessionIDs: ["ses-kind"],
        kind: "gotcha" as const,
      }

      //#when staging the knowledge
      const { metaPath } = await writer.stage(knowledge)

      //#then meta.json carries the kind
      const meta = JSON.parse(await fs.readFile(metaPath, "utf-8")) as { kind?: string }
      expect(meta.kind).toBe("gotcha")
    } finally {
      process.chdir(origCwd)
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})
