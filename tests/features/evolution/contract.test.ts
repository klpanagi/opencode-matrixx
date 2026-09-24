/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import type { EvolutionConfig } from "../../../src/config/schema/evolution"
import { createCompressor } from "../../../src/features/evolution/compressor"
import { DistilledKnowledgeDataSchema } from "../../../src/features/evolution/schema"
import { EVOLUTION_DIR, TraceStore, traceStore } from "../../../src/features/evolution/store"
import { BUDGET_FILE, budgetPath, emptyLedger, recordUsage, utcDayKey, withinDailyCap } from "../../../src/features/evolution/store/budget-ledger"
import { isRetrievable } from "../../../src/features/evolution/store/lifecycle"
import { UNSCOPED_LEGACY, normalizeProjectId } from "../../../src/features/evolution/store/project-identity"
import type { CompressionInput, TraceRecord } from "../../../src/features/evolution/types"

function makeTrace(id: string, success = true, tool = "read"): TraceRecord {
  return {
    id,
    sessionID: "ses-contract",
    callID: `call-${id}`,
    timestamp: new Date().toISOString(),
    agent: "test-agent",
    tool,
    args: {},
    output: `out-${id}`,
    durationMs: 10,
    success,
  }
}

function makeInput(traces: TraceRecord[], sessionID = "ses-contract"): CompressionInput {
  return { sessionID, traces }
}

function defaultCompressorConfig(): EvolutionConfig["compressor"] {
  return { provider: "llm", minTraces: 5, maxInputTokens: 32000, trigger: "both" }
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe("DistilledKnowledge data contract (T4a)", () => {
  test("legacy JSON without contract fields parses with fail-open defaults", () => {
    //#given a stored knowledge object predating the T4a fields
    const stored = {
      title: "t",
      summary: "s",
      patterns: [],
      pitfalls: [],
      prerequisites: [],
      confidence: 0.5,
      sourceSessionIDs: ["ses-x"],
    }

    //#when parsing through the data schema
    const parsed = DistilledKnowledgeDataSchema.parse(stored)

    //#then sourceTraceIDs defaults to [] and optional fields stay absent
    expect(parsed.sourceTraceIDs).toEqual([])
    expect(parsed.projectId).toBeUndefined()
    expect(parsed.distilledAt).toBeUndefined()
    expect(parsed.kind).toBe("convention")
  })

  test("data schema preserves supplied contract fields", () => {
    //#given a knowledge object carrying every T4a field
    const stored = {
      title: "t",
      summary: "s",
      patterns: [],
      pitfalls: [],
      prerequisites: [],
      confidence: 0.5,
      sourceSessionIDs: ["ses-x"],
      projectId: "proj-1",
      sourceTraceIDs: ["tr-1", "tr-2"],
      distilledAt: "2026-01-01T00:00:00.000Z",
    }

    //#when parsing through the data schema
    const parsed = DistilledKnowledgeDataSchema.parse(stored)

    //#then each field is retained verbatim
    expect(parsed.projectId).toBe("proj-1")
    expect(parsed.sourceTraceIDs).toEqual(["tr-1", "tr-2"])
    expect(parsed.distilledAt).toBe("2026-01-01T00:00:00.000Z")
  })
})

describe("compressor contract population (T4a)", () => {
  test("llm parse populates sourceTraceIDs from input traces and distilledAt ISO", async () => {
    //#given an llmCall whose JSON omits the T4a fields
    const compressor = createCompressor(defaultCompressorConfig(), async () =>
      JSON.stringify({
        title: "stub",
        summary: "stub summary",
        patterns: [],
        pitfalls: [],
        prerequisites: [],
        confidence: 0.8,
        sourceSessionIDs: ["ses-contract"],
      }),
    )
    const input = makeInput([makeTrace("a"), makeTrace("b"), makeTrace("c"), makeTrace("d"), makeTrace("e")])

    //#when compressing
    const result = await compressor.compress(input)

    //#then provenance fields are derived from the input traces
    expect(result.knowledge.sourceTraceIDs).toEqual(["a", "b", "c", "d", "e"])
    expect(result.knowledge.distilledAt).toMatch(ISO_RE)
    expect(result.knowledge.projectId).toBe(UNSCOPED_LEGACY)
  })

  test("llm parse honors explicit sourceTraceIDs when supplied", async () => {
    //#given an llmCall returning explicit provenance
    const compressor = createCompressor(defaultCompressorConfig(), async () =>
      JSON.stringify({
        title: "stub",
        summary: "stub summary",
        patterns: [],
        pitfalls: [],
        prerequisites: [],
        confidence: 0.8,
        sourceSessionIDs: ["ses-contract"],
        sourceTraceIDs: ["explicit-1"],
        distilledAt: "2020-05-05T00:00:00.000Z",
        projectId: "proj-9",
      }),
    )
    const input = makeInput([makeTrace("a"), makeTrace("b"), makeTrace("c"), makeTrace("d"), makeTrace("e")])

    //#when compressing
    const result = await compressor.compress(input)

    //#then the explicit values win over the derived defaults
    expect(result.knowledge.sourceTraceIDs).toEqual(["explicit-1"])
    expect(result.knowledge.distilledAt).toBe("2020-05-05T00:00:00.000Z")
    expect(result.knowledge.projectId).toBe("proj-9")
  })

  test("offline heuristic populates sourceTraceIDs, distilledAt and unscoped projectId", async () => {
    //#given an offline compressor with enough traces
    const compressor = createCompressor(defaultCompressorConfig())
    const input = makeInput([makeTrace("a"), makeTrace("b"), makeTrace("c"), makeTrace("d"), makeTrace("e")])

    //#when compressing
    const result = await compressor.compress(input)

    //#then the provenance contract is populated deterministically
    expect(result.knowledge.sourceTraceIDs).toEqual(["a", "b", "c", "d", "e"])
    expect(result.knowledge.distilledAt).toMatch(ISO_RE)
    expect(result.knowledge.projectId).toBe(UNSCOPED_LEGACY)
  })
})

describe("usage channel contract (T4a)", () => {
  test("compress resolves to { knowledge, usage } with the stubbed usage", async () => {
    //#given a compressor whose llmCall reports usage
    const compressor = createCompressor(defaultCompressorConfig(), async () =>
      JSON.stringify({
        title: "stub",
        summary: "s",
        patterns: [],
        pitfalls: [],
        prerequisites: [],
        confidence: 0.8,
        sourceSessionIDs: ["ses-contract"],
      }),
    )

    //#when compressing
    const result = await compressor.compress(makeInput([makeTrace("a"), makeTrace("b"), makeTrace("c"), makeTrace("d"), makeTrace("e")]))

    //#then the returned shape is the normative { knowledge, usage? } contract
    expect(Object.keys(result).sort()).toEqual(["knowledge", "usage"])
    expect(result.usage?.inputTokens).toBeGreaterThan(0)
    expect(result.usage?.outputTokens).toBeGreaterThan(0)
    expect(typeof result.usage?.costCents).toBe("number")
  })
})

describe("retrieval filter contract (T4a)", () => {
  test("approved, unquarantined, same-scope, matching-kind, under-cap is retrievable", () => {
    //#given an approved proposal inside the queried scope
    const meta = { status: "approved" as const, projectId: "proj-1", kind: "workflow" as const, tokenCost: 100 }

    //#when evaluating against a matching scope
    const result = isRetrievable(meta, { projectId: "proj-1", kinds: ["workflow"], tokenCap: 200 })

    //#then it passes
    expect(result).toBe(true)
  })

  test.each(["pending", "quarantined", "superseded", "rejected"] as const)("non-approved status %s is filtered out", (status) => {
    //#given a proposal in a non-approved lifecycle state
    const meta = { status, projectId: "proj-1", kind: "workflow" as const }

    //#when evaluating
    const result = isRetrievable(meta, { projectId: "proj-1" })

    //#then it never surfaces
    expect(result).toBe(false)
  })

  test("quarantined or superseded flags filter an otherwise approved proposal", () => {
    //#given approved flags but a quarantine/supersede marker
    const quarantined = { status: "approved" as const, quarantined: true, projectId: "proj-1" }
    const superseded = { status: "approved" as const, superseded: true, projectId: "proj-1" }

    //#when evaluating
    const q = isRetrievable(quarantined, { projectId: "proj-1" })
    const s = isRetrievable(superseded, { projectId: "proj-1" })

    //#then both are filtered out
    expect(q).toBe(false)
    expect(s).toBe(false)
  })

  test("project scope mismatch filters out; unscoped matches unscoped", () => {
    //#given an approved proposal for another project
    const meta = { status: "approved" as const, projectId: "proj-other", kind: "workflow" as const }
    const unscoped = { status: "approved" as const, projectId: undefined, kind: "workflow" as const }

    //#when evaluating against the current project scope
    const mismatch = isRetrievable(meta, { projectId: "proj-1" })
    const unscopedMatch = isRetrievable(unscoped, { projectId: UNSCOPED_LEGACY })

    //#then mismatch is filtered and the sentinel pair matches
    expect(mismatch).toBe(false)
    expect(unscopedMatch).toBe(true)
  })

  test("kind filter and token cap are enforced", () => {
    //#given an approved proposal of one kind over a token cap
    const meta = { status: "approved" as const, projectId: "proj-1", kind: "gotcha" as const, tokenCost: 500 }

    //#when evaluating against a different kind and a tighter cap
    const wrongKind = isRetrievable(meta, { projectId: "proj-1", kinds: ["workflow"] })
    const overCap = isRetrievable(meta, { projectId: "proj-1", tokenCap: 100 })
    const underUnrestricted = isRetrievable(meta, { projectId: "proj-1" })

    //#then kind mismatch and cap overflow filter, unrestricted passes
    expect(wrongKind).toBe(false)
    expect(overCap).toBe(false)
    expect(underUnrestricted).toBe(true)
  })
})

describe("store barrel preserves import path (T4a)", () => {
  test("traceStore and TraceStore resolve from the legacy specifier", () => {
    //#given the legacy import specifier
    //#when inspecting the resolved exports
    //#then the same public surface is available
    expect(traceStore).toBeInstanceOf(TraceStore)
    expect(typeof EVOLUTION_DIR).toBe("string")
    expect(EVOLUTION_DIR).toBe(".matrixx/evolution")
  })
})

describe("budget ledger pure helpers (T4a)", () => {
  test("utcDayKey and budgetPath are deterministic", () => {
    //#given a fixed instant and evolution dir
    const at = new Date("2026-03-04T23:30:00.000Z")

    //#when deriving the day key and ledger path
    const day = utcDayKey(at)
    const p = budgetPath(".matrixx/evolution")

    //#then both are stable and UTC-based
    expect(day).toBe("2026-03-04")
    expect(p).toBe(".matrixx/evolution/budget.json")
    expect(BUDGET_FILE).toBe(".matrixx/evolution/budget.json")
  })

  test("recordUsage accumulates spend and rolls to a new UTC day", () => {
    //#given an empty ledger for one day
    const day1 = new Date("2026-03-04T10:00:00.000Z")
    let ledger = emptyLedger(utcDayKey(day1))

    //#when recording two usage events, then one on the next day
    ledger = recordUsage(ledger, { inputTokens: 10, outputTokens: 5, costCents: 3 }, day1)
    ledger = recordUsage(ledger, { inputTokens: 20, outputTokens: 8, costCents: 4 }, day1)
    const afterTwo = ledger
    ledger = recordUsage(ledger, { inputTokens: 1, outputTokens: 1, costCents: 2 }, new Date("2026-03-05T01:00:00.000Z"))

    //#then same-day spend sums and the new day resets
    expect(afterTwo.spendCents).toBe(7)
    expect(afterTwo.events).toHaveLength(2)
    expect(ledger.day).toBe("2026-03-05")
    expect(ledger.spendCents).toBe(2)
    expect(ledger.events).toHaveLength(1)
  })

  test("withinDailyCap respects the configured cap boundary", () => {
    //#given a ledger already near the cap
    const ledger = { day: "2026-03-04", spendCents: 95, events: [] }

    //#when checking an increment that stays under and one that exceeds
    const under = withinDailyCap(ledger, { inputTokens: 1, outputTokens: 1, costCents: 5 }, 100)
    const over = withinDailyCap(ledger, { inputTokens: 1, outputTokens: 1, costCents: 6 }, 100)

    //#then the boundary is inclusive
    expect(under).toBe(true)
    expect(over).toBe(false)
  })
})

describe("project identity normalize (T4a)", () => {
  test("missing or empty projectId normalizes to the unscoped sentinel", () => {
    //#given absent and empty identities
    //#when normalizing
    const missing = normalizeProjectId(undefined)
    const empty = normalizeProjectId("")
    const present = normalizeProjectId("proj-1")

    //#then only a real id passes through
    expect(missing).toBe(UNSCOPED_LEGACY)
    expect(empty).toBe(UNSCOPED_LEGACY)
    expect(present).toBe("proj-1")
  })
})
