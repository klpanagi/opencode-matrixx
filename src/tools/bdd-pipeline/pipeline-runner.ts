import type {
  BddPipelineContext,
  BddPipelineDeps,
  BddPipelineResult,
  BddPipelineStageName,
  BddPipelineStageResult,
} from "./types"

const STAGE_PROMPTS: Record<BddPipelineStageName, string> = {
  tests:
    "Generate cucumber step definitions, page objects, cucumber.cjs, Dockerfile, and run-tests.sh " +
    "from the contract. Run the test suite as the FINAL step. Return a structured report.",
  frontend:
    "Generate React components, *.test.tsx, and preview-server.ts from the contract. " +
    "Run unit tests as the FINAL step. Return a structured report.",
  backend:
    "Generate typed Zod API services and *.test.ts from the contract. " +
    "Run unit tests as the FINAL step. Return a structured report.",
}

function deriveFeatureName(featurePath: string): string {
  const base = featurePath.split("/").pop() ?? "feature"
  return base.replace(/\.feature$/i, "")
}

function emptyStage(stage: BddPipelineStageName, error?: string): BddPipelineStageResult {
  return {
    stage,
    status: "failed",
    filesCreated: [],
    testsRun: 0,
    testsPassed: 0,
    testsFailed: 0,
    testOutput: "",
    error,
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

export async function runBddPipeline(
  args: { featurePaths: string[]; outDir: string; force?: boolean },
  ctxIn: Omit<BddPipelineContext, "outDir" | "force" | "featureName">,
  deps: BddPipelineDeps,
): Promise<BddPipelineResult> {
  const startedAt = nowIso()
  const [featurePath] = args.featurePaths
  if (!featurePath) {
    return {
      feature: "unknown",
      sourceFile: "",
      contractPath: "",
      status: "FAIL",
      stages: {
        tests: emptyStage("tests", "no feature path"),
        frontend: emptyStage("frontend", "no feature path"),
        backend: emptyStage("backend", "no feature path"),
      },
      missingOutputs: [],
      ambiguities: [],
      startedAt,
      finishedAt: nowIso(),
      error: "no feature path",
    }
  }

  const featureName = deriveFeatureName(featurePath)
  const featureDir = `${args.outDir.replace(/\/$/, "")}/${featureName}`
  const ctx: BddPipelineContext = {
    ...ctxIn,
    outDir: featureDir,
    force: args.force ?? false,
    featureName,
  }

  const parsed = await deps.parseFeature(featurePath)
  if (!parsed.success || !parsed.data) {
    return {
      feature: featureName,
      sourceFile: featurePath,
      contractPath: "",
      status: "FAIL",
      stages: {
        tests: emptyStage("tests", "parse failed"),
        frontend: emptyStage("frontend", "parse failed"),
        backend: emptyStage("backend", "parse failed"),
      },
      missingOutputs: [],
      ambiguities: [],
      startedAt,
      finishedAt: nowIso(),
      error: parsed.error ?? "parse failed",
    }
  }

  const sourceText = await deps.readFeatureSource(featurePath)
  const created = await deps.createContract({
    parsedAst: JSON.stringify({ success: true, data: parsed.data }),
    sourceFile: featurePath,
    sourceText,
    force: ctx.force,
  })
  if (!created.success || !created.outputPath) {
    return {
      feature: featureName,
      sourceFile: featurePath,
      contractPath: "",
      status: "FAIL",
      stages: {
        tests: emptyStage("tests", "create contract failed"),
        frontend: emptyStage("frontend", "create contract failed"),
        backend: emptyStage("backend", "create contract failed"),
      },
      missingOutputs: [],
      ambiguities: [],
      startedAt,
      finishedAt: nowIso(),
      error: created.error ?? "create contract failed",
    }
  }

  const enriched = await deps.enrichContract(created.outputPath)
  if (!enriched.success || !enriched.contract) {
    return {
      feature: featureName,
      sourceFile: featurePath,
      contractPath: created.outputPath,
      status: "FAIL",
      stages: {
        tests: emptyStage("tests", "enrich failed"),
        frontend: emptyStage("frontend", "enrich failed"),
        backend: emptyStage("backend", "enrich failed"),
      },
      missingOutputs: [],
      ambiguities: [],
      startedAt,
      finishedAt: nowIso(),
      error: `enrich contract failed: ${enriched.error ?? "unknown"}`,
    }
  }

  const stages = await Promise.all(
    (["tests", "frontend", "backend"] as const).map((stage) =>
      deps.spawnSubagent(stage, STAGE_PROMPTS[stage], enriched.contract as never, ctx),
    ),
  )
  const stageResults: Record<BddPipelineStageName, BddPipelineStageResult> = {
    tests: stages[0],
    frontend: stages[1],
    backend: stages[2],
  }

  const gate = await deps.gateRequiredOutputs(featureDir)

  const allStagesPassed = stages.every((s) => s.status === "completed" && s.testsFailed === 0)
  const status: BddPipelineResult["status"] = gate.ok && allStagesPassed ? "PASS" : "FAIL"

  const result: BddPipelineResult = {
    feature: featureName,
    sourceFile: featurePath,
    contractPath: created.outputPath,
    status,
    stages: stageResults,
    missingOutputs: gate.missing,
    ambiguities: [],
    startedAt,
    finishedAt: nowIso(),
  }

  await deps.writeAnalysis(featureDir, result)

  return result
}
