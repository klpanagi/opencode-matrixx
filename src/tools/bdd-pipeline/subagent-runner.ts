import type { BackgroundManager } from "../../features/background-agent/manager"
import type {
  BddPipelineStageName,
  BddPipelineStageResult,
  BddPipelineStageStatus,
} from "./types"

const POLL_INTERVAL_MS = 250
const POLL_TIMEOUT_MS = 600_000

const STAGE_AGENT: Record<BddPipelineStageName, string> = {
  tests: "bdd-tests",
  frontend: "bdd-frontend",
  backend: "bdd-backend",
}

const STAGE_CATEGORY: Record<BddPipelineStageName, string> = {
  tests: "source",
  frontend: "construct",
  backend: "source",
}

const STAGE_SKILLS: Record<BddPipelineStageName, string[]> = {
  tests: ["bdd-tests"],
  frontend: ["bdd-frontend"],
  backend: ["bdd-backend"],
}

function terminalStatusToStageStatus(status: string): BddPipelineStageStatus {
  if (status === "timeout") return "timeout"
  return "failed"
}

function extractJsonPayload(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  const direct = tryParse(raw.trim())
  if (direct) return direct
  const fence = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  if (fence) {
    const parsed = tryParse(fence[1].trim())
    if (parsed) return parsed
  }
  const firstBrace = raw.indexOf("{")
  const lastBrace = raw.lastIndexOf("}")
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return tryParse(raw.slice(firstBrace, lastBrace + 1))
  }
  return null
}

function tryParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s)
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === "string")
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function buildEmptyStage(stage: BddPipelineStageName, error?: string): BddPipelineStageResult {
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

export interface SpawnSubagentOptions {
  manager: BackgroundManager
  stage: BddPipelineStageName
  prompt: string
  contractPath: string
  parentSessionID: string
  parentMessageID: string
  parentAgent?: string
  abort?: AbortSignal
  outDir: string
}

export async function spawnStageSubagent(opts: SpawnSubagentOptions): Promise<BddPipelineStageResult> {
  const { manager, stage, prompt, contractPath } = opts
  const fullPrompt =
    `Contract JSON path: ${contractPath}\n` +
    `Output directory: ${opts.outDir}\n\n` +
    `${prompt}\n\n` +
    `When finished, return a JSON object on the LAST line of your output with this exact shape:\n` +
    `{"stage":"${stage}","files_created":[...absolute paths...],"tests_run":N,"tests_passed":N,"tests_failed":N,"test_output":"<first 200 lines of failing test output, or empty>","error":"<message or empty>"}`

  const task = await manager.launch({
    description: `[bdd-pipeline] ${stage}`,
    prompt: fullPrompt,
    agent: STAGE_AGENT[stage],
    parentSessionID: opts.parentSessionID,
    parentMessageID: opts.parentMessageID,
    parentAgent: opts.parentAgent,
    parentTools: undefined,
    category: STAGE_CATEGORY[stage],
    skills: STAGE_SKILLS[stage],
  })

  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (true) {
    if (opts.abort?.aborted) {
      return buildEmptyStage(stage, "aborted")
    }
    const current = manager.getTask(task.id)
    if (!current) {
      return buildEmptyStage(stage, "task missing from manager")
    }
    const status: string = current.status
    if (status === "completed" || status === "error" || status === "cancelled" || status === "interrupt" || status === "timeout") {
      if (status === "completed") {
        const payload = extractJsonPayload(current.result ?? "")
        if (payload) {
          return {
            stage,
            status: "completed",
            filesCreated: asStringArray(payload.files_created),
            testsRun: asNumber(payload.tests_run),
            testsPassed: asNumber(payload.tests_passed),
            testsFailed: asNumber(payload.tests_failed),
            testOutput: typeof payload.test_output === "string" ? payload.test_output : "",
            error: typeof payload.error === "string" && payload.error ? payload.error : undefined,
          }
        }
        return {
          stage,
          status: "failed",
          filesCreated: [],
          testsRun: 0,
          testsPassed: 0,
          testsFailed: 0,
          testOutput: current.result ?? "",
          error: "subagent returned no parseable JSON report",
        }
      }
      return {
        stage,
        status: terminalStatusToStageStatus(status),
        filesCreated: [],
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0,
        testOutput: current.result ?? "",
        error: current.error ?? `subagent status: ${status}`,
      }
    }
    if (Date.now() > deadline) {
      return buildEmptyStage(stage, "poll timeout")
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
}
