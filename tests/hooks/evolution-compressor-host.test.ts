/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as fsp from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import type { EvolutionConfig } from "../../src/config/schema/evolution"
import { traceStore } from "../../src/features/evolution/store"
import type { TraceRecord } from "../../src/features/evolution/types"
import { createEvolutionCompressorHook } from "../../src/hooks/evolution-compressor"

function makeTrace(id: string): TraceRecord {
  return {
    id,
    sessionID: "ses-host",
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

function hostConfig(): EvolutionConfig {
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

let tmpDir: string
let origCwd: string

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "compressor-host-test-"))
  origCwd = process.cwd()
  process.chdir(tmpDir)
})

afterEach(async () => {
  process.chdir(origCwd)
  await fsp.rm(tmpDir, { recursive: true, force: true })
})

describe("evolution compressor hook retention wiring (T3)", () => {
  test("invokes trace cleanup after a successful run and purges stale traces", async () => {
    //#given enough fresh traces for compression plus a stale trace file
    const tracesDir = path.resolve(tmpDir, ".matrixx/evolution/traces")
    fs.mkdirSync(tracesDir, { recursive: true })
    for (let i = 0; i < 6; i++) await traceStore.append(makeTrace(`t${i}`))
    const stalePath = path.join(tracesDir, "stale.jsonl")
    fs.writeFileSync(stalePath, "{}\n", "utf-8")
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    fs.utimesSync(stalePath, old, old)
    const hook = createEvolutionCompressorHook(hostConfig())

    //#when a session.idle event triggers compression
    await hook.event({ event: { type: "session.idle", properties: { sessionID: "ses-host" } } })

    //#then the stale trace is purged while the run still completed
    expect(fs.existsSync(stalePath)).toBe(false)
    const state = await traceStore.getState()
    expect(state.totalCompressions).toBeGreaterThan(0)
  })
})
