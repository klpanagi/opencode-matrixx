import * as fs from "node:fs"
import { resolve as resolvePath } from "node:path"
import { type ToolDefinition, tool } from "@opencode-ai/plugin"
import type { BackgroundManager } from "../../features/background-agent/manager"
import { type Contract, ContractSchema } from "../../features/bdd/schema"
import { createBddCreateContractTool } from "../bdd-create-contract/tools"
import { createBddParseGherkinTool } from "../bdd-parse-gherkin/tools"
import { buildAnalysisReport } from "./analysis-report"
import { BDD_PIPELINE_DESCRIPTION, PIPELINE_REQUIRED_OUTPUTS } from "./constants"
import { resolveFeaturePaths } from "./feature-resolver"
import { runBddPipeline } from "./pipeline-runner"
import { spawnStageSubagent } from "./subagent-runner"
import type {
  BddPipelineContext,
  BddPipelineDeps,
  BddPipelineResult,
  BddPipelineStageName,
  CreateContractResult,
  EnrichContractResult,
  GateResult,
  ParseFeatureResult,
} from "./types"

const ENRICH_AGENT = "bdd-contract"
const ENRICH_POLL_TIMEOUT_MS = 600_000
const ENRICH_POLL_INTERVAL_MS = 250

export function createBddPipelineTool(opts: {
  manager: BackgroundManager
}): ToolDefinition {
  const { manager } = opts
  const parseTool = createBddParseGherkinTool()
  const createTool = createBddCreateContractTool()

  return tool({
    description: BDD_PIPELINE_DESCRIPTION,
    args: {
      featurePaths: tool.schema
        .array(tool.schema.string())
        .describe(
          "One or more .feature file paths, directories, or glob patterns (e.g. 'features/**/*.feature').",
        ),
      outDir: tool.schema.string().describe("Output directory root; per-feature dirs are created under it"),
      force: tool.schema
        .boolean()
        .default(false)
        .describe("Overwrite existing contract / output files"),
    },
    async execute(args, ctx): Promise<string> {
      try {
        const featurePaths = resolveFeaturePaths(
          (args.featurePaths as string[]) ?? [],
        )
        if (featurePaths.length === 0) {
          return JSON.stringify({
            success: false,
            error: "no .feature files matched the provided inputs",
          })
        }
        const pipelineCtx: Omit<BddPipelineContext, "outDir" | "force" | "featureName"> = {
          parentSessionID: ctx.sessionID,
          parentMessageID: ctx.messageID,
          parentAgent: ctx.agent,
          abort: ctx.abort,
        }
        const results: BddPipelineResult[] = []
        for (const featurePath of featurePaths) {
          const deps = makeDeps({
            manager,
            parseTool,
            createTool,
            parentSessionID: ctx.sessionID,
            parentMessageID: ctx.messageID,
            parentAgent: ctx.agent,
            outDir: args.outDir as string,
            featurePath,
            abort: ctx.abort,
            force: Boolean(args.force),
          })
          const result = await runBddPipeline(
            { featurePaths: [featurePath], outDir: args.outDir as string, force: Boolean(args.force) },
            pipelineCtx,
            deps,
          )
          results.push(result)
        }
        return JSON.stringify({
          success: true,
          count: results.length,
          passed: results.filter((r) => r.status === "PASS").length,
          failed: results.filter((r) => r.status === "FAIL").length,
          results,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return JSON.stringify({ success: false, error: message })
      }
    },
  })
}

function makeDeps(args: {
  manager: BackgroundManager
  parseTool: ToolDefinition
  createTool: ToolDefinition
  parentSessionID: string
  parentMessageID: string
  parentAgent: string
  outDir: string
  featurePath: string
  abort?: AbortSignal
  force: boolean
}): BddPipelineDeps {
  const featureName = args.featurePath
    .split("/")
    .pop()
    ?.replace(/\.feature$/i, "") ?? "feature"
  const _featureDir = resolvePath(args.outDir, featureName)

  return {
    parseFeature: async (path: string): Promise<ParseFeatureResult> => {
      const raw = await args.parseTool.execute({ filePath: path }, dummyCtx(args))
      return JSON.parse(raw)
    },
    readFeatureSource: async (path: string): Promise<string> => {
      return fs.readFileSync(path, "utf-8")
    },
    createContract: async (a): Promise<CreateContractResult> => {
      const raw = await args.createTool.execute(
        {
          parsedAst: a.parsedAst,
          sourceFile: a.sourceFile,
          sourceText: a.sourceText,
          force: a.force ?? args.force,
          outputPath: a.outputPath ?? `${a.sourceFile}.contract.json`,
        },
        dummyCtx(args),
      )
      return JSON.parse(raw)
    },
    enrichContract: async (contractPath: string): Promise<EnrichContractResult> => {
      return runEnrich(contractPath, args)
    },
    spawnSubagent: async (stage: BddPipelineStageName, prompt: string, _contract: Contract, ctx: BddPipelineContext) => {
      return spawnStageSubagent({
        manager: args.manager,
        stage,
        prompt,
        contractPath: `${ctx.outDir}/contract.json`,
        parentSessionID: args.parentSessionID,
        parentMessageID: args.parentMessageID,
        parentAgent: args.parentAgent,
        abort: args.abort,
        outDir: ctx.outDir,
      })
    },
    gateRequiredOutputs: async (dir: string): Promise<GateResult> => {
      const missing: string[] = []
      for (const name of PIPELINE_REQUIRED_OUTPUTS) {
        if (!fs.existsSync(resolvePath(dir, name))) missing.push(name)
      }
      return { ok: missing.length === 0, missing }
    },
    writeAnalysis: async (dir: string, result: BddPipelineResult): Promise<void> => {
      const contractPath = resolvePath(dir, "contract.json")
      if (!fs.existsSync(contractPath)) {
        fs.writeFileSync(resolvePath(dir, "ANALYSIS.md"), "# Feature Analysis\n\n(no contract found)\n", "utf-8")
        return
      }
      const contract: Contract = ContractSchema.parse(
        JSON.parse(fs.readFileSync(contractPath, "utf-8")),
      )
      const report = buildAnalysisReport({ contract, result, featureDir: dir })
      fs.writeFileSync(resolvePath(dir, "ANALYSIS.md"), report, "utf-8")
    },
  }
}

function dummyCtx(args: { parentSessionID: string; parentMessageID: string; parentAgent: string }) {
  return {
    sessionID: args.parentSessionID,
    messageID: args.parentMessageID,
    agent: args.parentAgent,
    directory: process.cwd(),
    worktree: process.cwd(),
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => undefined,
  }
}

async function runEnrich(
  contractPath: string,
  args: {
    manager: BackgroundManager
    parentSessionID: string
    parentMessageID: string
    parentAgent: string
    abort?: AbortSignal
  },
): Promise<EnrichContractResult> {
  const prompt =
    `Enrich the contract at ${contractPath}.\n` +
    `Read it, infer the api/ui/state/assumptions annotations from the feature content, ` +
    `and write the enriched contract back to the same path.`
  const task = await args.manager.launch({
    description: "[bdd-pipeline] contract enrich",
    prompt,
    agent: ENRICH_AGENT,
    parentSessionID: args.parentSessionID,
    parentMessageID: args.parentMessageID,
    parentAgent: args.parentAgent,
    category: "source",
    skills: ["bdd-contract"],
  })
  const deadline = Date.now() + ENRICH_POLL_TIMEOUT_MS
  while (true) {
    if (args.abort?.aborted) return { success: false, error: "aborted" }
    const current = args.manager.getTask(task.id)
    if (!current) return { success: false, error: "task missing from manager" }
    const status: string = current.status
    if (status === "completed") break
    if (status === "error" || status === "cancelled" || status === "interrupt" || status === "timeout") {
      return { success: false, error: current.error ?? `enrich status: ${status}` }
    }
    if (Date.now() > deadline) return { success: false, error: "enrich poll timeout" }
    await new Promise((r) => setTimeout(r, ENRICH_POLL_INTERVAL_MS))
  }
  if (!fs.existsSync(contractPath)) {
    return { success: false, error: "contract path missing after enrichment" }
  }
  const parsed = ContractSchema.safeParse(JSON.parse(fs.readFileSync(contractPath, "utf-8")))
  if (!parsed.success) {
    return { success: false, error: `enriched contract failed validation: ${parsed.error.message}` }
  }
  return { success: true, contract: parsed.data }
}
