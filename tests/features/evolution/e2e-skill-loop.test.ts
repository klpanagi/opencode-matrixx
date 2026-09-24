/// <reference types="bun-types" />
// T10b — mechanized end-to-end proof of the self-evolution loop:
// seed real traces -> pipeline (stubbed LLM AND offline heuristic) -> staged
// artifact with kind/projectId/sourceTraceIDs -> approve via the `evolution`
// tool -> `.opencode/skills/<slug>/SKILL.md` with provenance -> next-session
// load check (enumerate + parse frontmatter) -> negative over-pending path.
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as fsp from "node:fs/promises"
import * as path from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import type { LlmCall } from "../../../src/features/evolution/compressor/interface"
import { runEvolutionPipeline } from "../../../src/features/evolution/pipeline"
import { EVOLUTION_DIR, loadLedger, resolveProjectIdentity, traceStore } from "../../../src/features/evolution/store"
import type { TraceRecord } from "../../../src/features/evolution/types"
import { createEvolutionTool } from "../../../src/tools/evolution"
import {
  PENDING_DIR,
  e2eConfig,
  enumerateLoadableSkills,
  makeProject,
  makeTrace,
  readPendingMeta,
  readTraceIds,
} from "./e2e-harness"

let tmpDir: string
let origCwd: string

beforeEach(() => {
  tmpDir = makeProject()
  origCwd = process.cwd()
  process.chdir(tmpDir)
})

afterEach(async () => {
  process.chdir(origCwd)
  await fsp.rm(tmpDir, { recursive: true, force: true })
})

/** Seed `count` REAL traces through the store so they exist on disk too. */
async function seedTraces(sessionID: string, count: number, success = true): Promise<TraceRecord[]> {
  const traces = Array.from({ length: count }, (_, i) => makeTrace(`tr-${i}`, sessionID, success))
  for (const trace of traces) await traceStore.append(trace)
  return traces
}

/** Stubbed paid path: returns a valid DistilledKnowledge JSON plus reported usage. */
function stubbedLlm(traces: TraceRecord[], sessionID: string): LlmCall {
  return async () => ({
    text: JSON.stringify({
      title: "e2e-llm-skill",
      summary: "Stubbed distillation proving the paid path stages provenance.",
      patterns: ["Use read successfully"],
      pitfalls: [],
      prerequisites: ["read"],
      confidence: 0.9,
      kind: "debugging_pattern",
      sourceSessionIDs: [sessionID],
      sourceTraceIDs: traces.map((trace) => trace.id),
    }),
    usage: { inputTokens: 12, outputTokens: 6, costCents: 5 },
  })
}

function approve(slug: string): Promise<string> {
  const record = createEvolutionTool({ directory: tmpDir, client: {} } as unknown as PluginInput)
  return record.evolution.execute(
    { action: "approve", slug },
    { sessionID: "ses-e2e", directory: tmpDir } as unknown as ToolContext,
  )
}

describe("evolution E2E loop (T10b)", () => {
  test("stubbed-LLM run stages knowledge with kind, projectId, sourceTraceIDs, and recorded usage", async () => {
    //#given a project seeded with real on-disk traces and a paid-path stub
    const sessionID = "ses-e2e-llm"
    const traces = await seedTraces(sessionID, 6)
    const projectId = resolveProjectIdentity(tmpDir).projectId

    //#when the pipeline runs the paid path
    const result = await runEvolutionPipeline({ sessionID, traces }, e2eConfig(), stubbedLlm(traces, sessionID))

    //#then the artifact carries provenance, its usage is charged, and each trace id is a real row
    expect(result.staged).toBeDefined()
    expect(result.usage?.costCents).toBe(5)
    expect(loadLedger(path.resolve(tmpDir, EVOLUTION_DIR)).spendCents).toBe(5)
    const meta = readPendingMeta(result.staged as string)
    expect(meta.kind).toBe("debugging_pattern")
    expect(meta.projectId).toBe(projectId)
    expect(meta.trace_ids).toEqual(traces.map((trace) => trace.id))
    for (const id of meta.trace_ids as string[]) expect(readTraceIds(sessionID)).toContain(id)
  })

  test("offline heuristic run stages knowledge with heuristic kind and no usage", async () => {
    //#given real on-disk traces but no LLM (offline path)
    const sessionID = "ses-e2e-offline"
    const traces = await seedTraces(sessionID, 6)
    const projectId = resolveProjectIdentity(tmpDir).projectId

    //#when the pipeline degrades to the free heuristic
    const result = await runEvolutionPipeline({ sessionID, traces }, e2eConfig())

    //#then nothing is charged and provenance still names the real traces with a heuristic kind
    expect(result.staged).toBeDefined()
    expect(result.usage).toBeUndefined()
    const meta = readPendingMeta(result.staged as string)
    expect(meta.kind).toBe("workflow")
    expect(meta.projectId).toBe(projectId)
    expect(meta.trace_ids).toEqual(traces.map((trace) => trace.id))
  })

  test("load check finds nothing before approval (no accidental auto-promote)", async () => {
    //#given a staged-but-unapproved proposal
    const sessionID = "ses-e2e-preapprove"
    const traces = await seedTraces(sessionID, 6)
    const slug = (await runEvolutionPipeline({ sessionID, traces }, e2eConfig())).staged as string

    //#when enumerating loadable skills before any approval
    const skills = enumerateLoadableSkills(tmpDir)

    //#then nothing is loadable yet, proving the enumeration is not a no-op
    expect(skills.map((skill) => skill.slug)).not.toContain(slug)
    expect(fs.existsSync(path.join(tmpDir, ".opencode", "skills", slug, "SKILL.md"))).toBe(false)
  })

  test("approve promotes to .opencode/skills/<slug>/SKILL.md and the load check finds it", async () => {
    //#given a heuristic-staged pending proposal
    const sessionID = "ses-e2e-approve"
    const traces = await seedTraces(sessionID, 6)
    const projectId = resolveProjectIdentity(tmpDir).projectId
    const slug = (await runEvolutionPipeline({ sessionID, traces }, e2eConfig())).staged as string

    //#when the operator approves it through the evolution tool
    const receipt = await approve(slug)

    //#then the promoted SKILL.md exists and the mechanized load enumeration parses its provenance
    expect(receipt).toContain("Promoted")
    const skillPath = path.join(tmpDir, ".opencode", "skills", slug, "SKILL.md")
    expect(fs.existsSync(skillPath)).toBe(true)
    const skills = enumerateLoadableSkills(tmpDir)
    expect(skills.map((skill) => skill.slug)).toEqual([slug])
    const loaded = skills.find((skill) => skill.frontmatter.name === slug)
    expect(loaded).toBeDefined()
    const fm = loaded?.frontmatter as Record<string, unknown>
    expect(fm.derived_from).toEqual([sessionID])
    expect(fm.session_ids).toEqual([sessionID])
    expect(fm.trace_ids).toEqual(traces.map((trace) => trace.id))
    expect(fm.project_id).toBe(projectId)
    expect(fm.kind).toBe("workflow")
    expect(typeof fm.confidence).toBe("number")
    expect(typeof fm.distilled_at).toBe("string")
    if (process.env.EVOLUTION_E2E_EVIDENCE === "1") {
      const evidenceDir = path.join(origCwd, ".matrixx", "evidence")
      fs.mkdirSync(evidenceDir, { recursive: true })
      fs.writeFileSync(path.join(evidenceDir, "task-10b-e2e-SKILL.md"), fs.readFileSync(skillPath, "utf-8"))
    }
  })

  test("over-pending run short-circuits with reason max-pending and writes nothing", async () => {
    //#given a pending queue already at capacity
    fs.mkdirSync(path.resolve(tmpDir, PENDING_DIR), { recursive: true })
    for (const slug of ["a", "b", "c"]) {
      fs.writeFileSync(path.resolve(tmpDir, PENDING_DIR, `${slug}.md`), slug, "utf-8")
    }
    const config = e2eConfig()
    config.retention.maxPending = 3
    const traces = await seedTraces("ses-e2e-full", 6)

    //#when the pipeline runs
    const result = await runEvolutionPipeline({ sessionID: "ses-e2e-full", traces }, config, stubbedLlm(traces, "ses-e2e-full"))

    //#then it refuses with max-pending and leaves the queue untouched
    expect(result.reason).toBe("max-pending")
    expect(result.staged).toBeUndefined()
    const pending = fs.readdirSync(path.resolve(tmpDir, PENDING_DIR)).filter((file) => file.endsWith(".md"))
    expect(pending).toHaveLength(3)
  })
})
