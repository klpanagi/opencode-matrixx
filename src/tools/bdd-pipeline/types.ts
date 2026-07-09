import type { Contract } from "../../features/bdd/schema"

export interface BddPipelineArgs {
  featurePaths: string[]
  outDir: string
  force?: boolean
}

export type BddPipelineStageName = "tests" | "frontend" | "backend"

export type BddPipelineStageStatus = "completed" | "failed" | "timeout"

export interface BddPipelineStageResult {
  stage: BddPipelineStageName
  status: BddPipelineStageStatus
  filesCreated: string[]
  testsRun: number
  testsPassed: number
  testsFailed: number
  testOutput: string
  error?: string
}

export type BddPipelineStatus = "PASS" | "FAIL"

export interface BddPipelineResult {
  feature: string
  sourceFile: string
  contractPath: string
  status: BddPipelineStatus
  stages: Record<BddPipelineStageName, BddPipelineStageResult>
  missingOutputs: string[]
  ambiguities: string[]
  startedAt: string
  finishedAt: string
  error?: string
}

export interface BddPipelineContext {
  parentSessionID: string
  parentMessageID: string
  parentAgent?: string
  abort?: AbortSignal
  outDir: string
  force: boolean
  featureName: string
}

export interface ParseFeatureResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface CreateContractResult {
  success: boolean
  outputPath?: string
  error?: string
}

export interface EnrichContractResult {
  success: boolean
  contract?: Contract
  error?: string
}

export interface GateResult {
  ok: boolean
  missing: string[]
}

export interface BddPipelineDeps {
  parseFeature: (path: string) => Promise<ParseFeatureResult>
  createContract: (args: {
    parsedAst: string
    sourceFile: string
    sourceText: string
    force?: boolean
    outputPath?: string
  }) => Promise<CreateContractResult>
  enrichContract: (contractPath: string) => Promise<EnrichContractResult>
  spawnSubagent: (
    stage: BddPipelineStageName,
    prompt: string,
    contract: Contract,
    ctx: BddPipelineContext,
  ) => Promise<BddPipelineStageResult>
  gateRequiredOutputs: (featureDir: string) => Promise<GateResult>
  writeAnalysis: (featureDir: string, report: BddPipelineResult) => Promise<void>
  readFeatureSource: (path: string) => Promise<string>
}
