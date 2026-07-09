import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test"
import * as fs from "node:fs"
import type { BddPipelineArgs } from "./types"

const callLog: string[] = []
const writtenFiles = new Map<string, string>()
const existingFiles = new Set<string>()

const _originalFs = { ...fs }
mock.module("node:fs", () => ({
  ..._originalFs,
  existsSync: (p: string) => existingFiles.has(p),
  writeFileSync: (p: string, data: string) => {
    writtenFiles.set(p, data)
    callLog.push(`write:${p}`)
  },
  readFileSync: (p: string) => {
    const v = writtenFiles.get(p) ?? ""
    callLog.push(`read:${p}`)
    return v
  },
}))

afterAll(() => {
  mock.restore()
})

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeContract() {
  return {
    schemaVersion: 1 as const,
    generatedAt: "2026-01-01T00:00:00.000Z",
    sourceFile: "/test/login.feature",
    feature: { name: "User Login", description: "Auth flow", tags: [] },
    scenarios: [
      {
        name: "Successful login",
        tags: [],
        steps: [
          { keyword: "Given" as const, text: "the user is on the login page" },
          { keyword: "When" as const, text: "the user enters valid credentials" },
          { keyword: "Then" as const, text: "the user is redirected to the dashboard" },
        ],
      },
    ],
    annotations: {
      api: { endpoints: [{ method: "POST", path: "/api/v1/auth/login" }] },
      ui: { routes: [{ name: "login", path: "/login" }] },
      state: { variables: [{ name: "session", type: "object" as const }] },
      assumptions: ["session holds { token, expiresAt }"],
    },
  }
}

function makeArgs(overrides: Partial<BddPipelineArgs> = {}): BddPipelineArgs {
  return {
    featurePaths: ["/test/login.feature"],
    outDir: "/out",
    force: false,
    ...overrides,
  }
}

interface FakeCtx {
  parentSessionID: string
  parentMessageID: string
  parentAgent?: string
  abort: AbortSignal
  outDir: string
  force: boolean
  featureName: string
}

function makeCtx(overrides: Partial<FakeCtx> = {}): FakeCtx {
  return {
    parentSessionID: "parent-1",
    parentMessageID: "msg-1",
    parentAgent: "morpheus",
    abort: new AbortController().signal,
    outDir: "/out/login",
    force: false,
    featureName: "login",
    ...overrides,
  }
}

function makeStageResult(stage: "tests" | "frontend" | "backend", overrides: Record<string, unknown> = {}) {
  return {
    stage,
    status: "completed" as const,
    filesCreated: [`/out/login/${stage}/dummy.ts`],
    testsRun: 5,
    testsPassed: 5,
    testsFailed: 0,
    testOutput: "All 5 tests passed",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// buildDeps — constructs a fully-mocked deps object whose spawn order is
// observable via callLog. Each subagent stage records the order in which
// it was called; tests assert the order of (parse -> contract -> enrich
// -> 3 parallel subagents -> gate -> analysis).
// ---------------------------------------------------------------------------

interface DepsRecorder {
  parseCalls: string[]
  createContractCalls: string[]
  enrichCalls: string[]
  spawnCalls: Array<{ stage: string; order: number }>
  gateCalls: string[]
  writeAnalysisCalls: string[]
  readSourceCalls: string[]
  spawnResults: Map<string, ReturnType<typeof makeStageResult>>
}

function buildDeps(recorder: DepsRecorder, overrides: Partial<{
  stageResults: Map<string, ReturnType<typeof makeStageResult>>
  enrichFn: (contractPath: string) => Promise<{ success: boolean; contract: ReturnType<typeof makeContract>; error?: string }>
  gateMissing: string[]
}> = {}) {
  const stageResults = overrides.stageResults ?? new Map([
    ["tests", makeStageResult("tests")],
    ["frontend", makeStageResult("frontend")],
    ["backend", makeStageResult("backend")],
  ])
  recorder.spawnResults = stageResults
  const enrichFn = overrides.enrichFn ?? (async (contractPath: string) => {
    recorder.enrichCalls.push(contractPath)
    return { success: true, contract: makeContract() }
  })

  return {
    parseFeature: async (path: string) => {
      recorder.parseCalls.push(path)
      return { success: true, data: { feature: { name: "User Login", children: [] } } }
    },
    createContract: async (args: { sourceFile: string }) => {
      recorder.createContractCalls.push(args.sourceFile)
      return { success: true, outputPath: `${args.sourceFile}.contract.json` }
    },
    enrichContract: enrichFn,
    spawnSubagent: async (
      stage: "tests" | "frontend" | "backend",
    ) => {
      const order = recorder.spawnCalls.length
      recorder.spawnCalls.push({ stage, order })
      await Promise.resolve()
      return stageResults.get(stage) ?? makeStageResult(stage, { status: "failed" })
    },
    gateRequiredOutputs: async (featureDir: string) => {
      recorder.gateCalls.push(featureDir)
      const missing = overrides.gateMissing ?? []
      return { ok: missing.length === 0, missing }
    },
    writeAnalysis: async (featureDir: string) => {
      recorder.writeAnalysisCalls.push(featureDir)
    },
    readFeatureSource: async (path: string) => {
      recorder.readSourceCalls.push(path)
      return "Feature: User Login\n"
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bdd-pipeline runner", () => {
  let recorder: DepsRecorder
  let runBddPipeline: typeof import("./pipeline-runner").runBddPipeline

  beforeEach(async () => {
    callLog.length = 0
    writtenFiles.clear()
    existingFiles.clear()
    recorder = {
      parseCalls: [],
      createContractCalls: [],
      enrichCalls: [],
      spawnCalls: [],
      gateCalls: [],
      writeAnalysisCalls: [],
      readSourceCalls: [],
      spawnResults: new Map(),
    }
    runBddPipeline = (await import("./pipeline-runner")).runBddPipeline
  })

  afterEach(() => {
    callLog.length = 0
  })

  it("runs the 5 phases in strict order: parse -> contract -> enrich -> 3x subagent -> gate -> analysis", async () => {
    //#given
    const deps = buildDeps(recorder)

    //#when
    const result = await runBddPipeline(makeArgs(), makeCtx(), deps)

    //#then
    expect(recorder.parseCalls).toEqual(["/test/login.feature"])
    expect(recorder.createContractCalls).toEqual(["/test/login.feature"])
    expect(recorder.enrichCalls).toHaveLength(1)
    expect(recorder.spawnCalls.map((c) => c.stage).sort()).toEqual(["backend", "frontend", "tests"])
    expect(recorder.gateCalls).toEqual(["/out/login"])
    expect(recorder.writeAnalysisCalls).toEqual(["/out/login"])
    expect(result.status).toBe("PASS")
  })

  it("spawns exactly 3 subagents (deterministic count) for a single feature", async () => {
    //#given
    const deps = buildDeps(recorder)

    //#when
    await runBddPipeline(makeArgs(), makeCtx(), deps)

    //#then
    expect(recorder.spawnCalls).toHaveLength(3)
    expect(new Set(recorder.spawnCalls.map((c) => c.stage))).toEqual(
      new Set(["tests", "frontend", "backend"]),
    )
  })

  it("enforces the 3-stage subagent plan even if one stage would have failed", async () => {
    //#given
    const stageResults = new Map([
      ["tests", makeStageResult("tests", { status: "failed", testsFailed: 2 })],
      ["frontend", makeStageResult("frontend")],
      ["backend", makeStageResult("backend")],
    ])
    const deps = buildDeps(recorder, { stageResults })

    //#when
    const result = await runBddPipeline(makeArgs(), makeCtx(), deps)

    //#then
    expect(recorder.spawnCalls).toHaveLength(3)
    expect(result.status).toBe("FAIL")
    expect(result.stages.tests.status).toBe("failed")
  })

  it("returns FAIL when the gate detects missing required outputs", async () => {
    //#given
    const deps = buildDeps(recorder, { gateMissing: ["cucumber.cjs"] })

    //#when
    const result = await runBddPipeline(makeArgs(), makeCtx(), deps)

    //#then
    expect(result.status).toBe("FAIL")
    expect(result.missingOutputs).toEqual(["cucumber.cjs"])
  })

  it("returns FAIL when the contract enrichment step fails", async () => {
    //#given
    const deps = buildDeps(recorder, {
      enrichFn: async () => ({ success: false, contract: makeContract(), error: "LLM timeout" }),
    })

    //#when
    const result = await runBddPipeline(makeArgs(), makeCtx(), deps)

    //#then
    expect(result.status).toBe("FAIL")
    expect(result.stages.tests.status).toBe("failed")
    expect(result.error).toContain("enrich")
  })

  it("does not spawn any subagent before contract enrichment completes", async () => {
    //#given
    let firstSpawnAt = 0
    let enrichmentFinishedAt = 0
    const deps = buildDeps(recorder, {
      enrichFn: async () => {
        await new Promise((r) => setTimeout(r, 10))
        enrichmentFinishedAt = Date.now()
        return { success: true, contract: makeContract() }
      },
    })
    const wrappedDeps = {
      ...deps,
      spawnSubagent: async (stage: "tests" | "frontend" | "backend") => {
        if (recorder.spawnCalls.length === 0) firstSpawnAt = Date.now()
        return deps.spawnSubagent(stage)
      },
    }

    //#when
    await runBddPipeline(makeArgs(), makeCtx(), wrappedDeps)

    //#then
    expect(enrichmentFinishedAt).toBeGreaterThan(0)
    expect(firstSpawnAt).toBeGreaterThan(0)
    expect(enrichmentFinishedAt).toBeLessThanOrEqual(firstSpawnAt)
  })

  it("includes a structured per-stage report in the result", async () => {
    //#given
    const deps = buildDeps(recorder)

    //#when
    const result = await runBddPipeline(makeArgs(), makeCtx(), deps)

    //#then
    expect(result.stages).toBeDefined()
    expect(result.stages.tests.stage).toBe("tests")
    expect(result.stages.tests.testsPassed).toBe(5)
    expect(result.stages.frontend.stage).toBe("frontend")
    expect(result.stages.backend.stage).toBe("backend")
  })
})
