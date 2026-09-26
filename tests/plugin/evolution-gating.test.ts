import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import * as path from "node:path"
import type { HookName, MatrixxConfig } from "../../src/config"
import { EvolutionConfigSchema } from "../../src/config/schema/evolution"
import { HookNameSchema } from "../../src/config/schema/hooks"
import type { BackgroundManager } from "../../src/features/background-agent"
import { readRetrievalRecords, searchRecords } from "../../src/features/evolution/store"
import { EVOLUTION_TEMPLATE } from "../../src/features/builtin-commands/templates/evolution"
import { createContinuationHooks } from "../../src/plugin/hooks/create-continuation-hooks"
import { createToolGuardHooks } from "../../src/plugin/hooks/create-tool-guard-hooks"
import { shouldEnableEvolutionTool } from "../../src/plugin/tool-gating"
import type { PluginContext } from "../../src/plugin/types"
import { createEvolutionTool } from "../../src/tools/evolution"

function makeBaseArgs(pluginConfig: MatrixxConfig) {
  return {
    ctx: { directory: "/tmp/evolution-gating-test" } as unknown as PluginContext,
    pluginConfig,
    isHookEnabled: (_name: HookName) => true,
    safeHookEnabled: true,
  }
}

function makeContinuationArgs(pluginConfig: MatrixxConfig) {
  return {
    ...makeBaseArgs(pluginConfig),
    backgroundManager: {} as unknown as BackgroundManager,
    sessionRecovery: null,
  }
}

function configWithEvolution(enabled: boolean): MatrixxConfig {
  return { evolution: EvolutionConfigSchema.parse({ enabled }) } as MatrixxConfig
}

describe("P2.3 evolution gating", () => {
  test("phantom evolution-quality-gate is absent from schema, keepers present", () => {
    //#given a HookNameSchema at 60 entries
    //#when parsing evolution names
    const phantom = HookNameSchema.safeParse("evolution-quality-gate")
    //#then phantom fails, keepers and real quality-gate pass
    expect(phantom.success).toBe(false)
    expect(HookNameSchema.safeParse("evolution-watcher").success).toBe(true)
    expect(HookNameSchema.safeParse("evolution-compressor").success).toBe(true)
    expect(HookNameSchema.safeParse("evolution-hitl").success).toBe(true)
    expect(HookNameSchema.safeParse("quality-gate").success).toBe(true)
  })

  test("tool-guard watcher is null unless evolution.enabled is true", () => {
    //#given configs with evolution unset, disabled, and enabled
    const unset = makeBaseArgs({} as MatrixxConfig)
    const disabled = makeBaseArgs(configWithEvolution(false))
    const enabled = makeBaseArgs(configWithEvolution(true))
    //#when creating tool-guard hooks
    const unsetHooks = createToolGuardHooks(unset)
    const disabledHooks = createToolGuardHooks(disabled)
    const enabledHooks = createToolGuardHooks(enabled)
    //#then watcher gated, real quality-gate unaffected
    expect(unsetHooks.evolutionWatcher).toBeNull()
    expect(disabledHooks.evolutionWatcher).toBeNull()
    expect(enabledHooks.evolutionWatcher).not.toBeNull()
    expect(unsetHooks.qualityGate).not.toBeNull()
    expect(enabledHooks.qualityGate).not.toBeNull()
  })

  test("continuation compressor+hitl are null unless evolution.enabled is true", () => {
    //#given configs with evolution unset, disabled, and enabled
    const unset = makeContinuationArgs({} as MatrixxConfig)
    const disabled = makeContinuationArgs(configWithEvolution(false))
    const enabled = makeContinuationArgs(configWithEvolution(true))
    //#when creating continuation hooks
    const unsetHooks = createContinuationHooks(unset)
    const disabledHooks = createContinuationHooks(disabled)
    const enabledHooks = createContinuationHooks(enabled)
    //#then compressor and hitl gated
    expect(unsetHooks.evolutionCompressor).toBeNull()
    expect(disabledHooks.evolutionCompressor).toBeNull()
    expect(unsetHooks.evolutionHitl).toBeNull()
    expect(disabledHooks.evolutionHitl).toBeNull()
    expect(enabledHooks.evolutionCompressor).not.toBeNull()
    expect(enabledHooks.evolutionHitl).not.toBeNull()
  })
})

describe("T2 evolution tool gating", () => {
  test("shouldEnableEvolutionTool is false unless enabled is true", () => {
    //#given unset, false, and true enabled flags
    //#when evaluating the evolution tool gate
    //#then only explicit true enables the tool
    expect(shouldEnableEvolutionTool(undefined)).toBe(false)
    expect(shouldEnableEvolutionTool(false)).toBe(false)
    expect(shouldEnableEvolutionTool(true)).toBe(true)
  })

  test("createEvolutionTool registers the evolution tool", () => {
    //#given a plugin context
    const ctx = { directory: "/tmp/evolution-gating-test" } as unknown as PluginContext
    //#when creating the evolution tool
    const record = createEvolutionTool(ctx)
    //#then the evolution tool is registered
    expect(Object.keys(record)).toEqual(["evolution"])
    expect(record.evolution.description).toContain("evolution")
  })

  test("/evolution template routes through the tool with zero evolution-state bash ops", () => {
    //#given the migrated evolution command template
    //#when scanning for evolution-state shell operations
    const pendingPathOp = /\.matrixx\/evolution\/pending\/.*\.(md|meta\.json).*(`|\*|$)/.test(EVOLUTION_TEMPLATE)
    const auditAppend = />>\s*\.matrixx\/evolution\/audit\.log/.test(EVOLUTION_TEMPLATE)
    const stateRm = /`rm\s[^\n]*\.matrixx\/evolution/.test(EVOLUTION_TEMPLATE)
    const stateCp = /`cp\s[^\n]*\.matrixx\/evolution/.test(EVOLUTION_TEMPLATE)
    const stateMkdir = /`mkdir[^\n]*\.matrixx\/evolution/.test(EVOLUTION_TEMPLATE)
    const pendingLs = /`ls\s[^\n]*\.matrixx\/evolution\/pending/.test(EVOLUTION_TEMPLATE)
    const auditTail = /`tail[^\n]*\.matrixx\/evolution\/audit\.log/.test(EVOLUTION_TEMPLATE)
    //#then no shell op touches evolution state and the tool is referenced
    expect(pendingPathOp).toBe(false)
    expect(auditAppend).toBe(false)
    expect(stateRm).toBe(false)
    expect(stateCp).toBe(false)
    expect(stateMkdir).toBe(false)
    expect(pendingLs).toBe(false)
    expect(auditTail).toBe(false)
    expect(EVOLUTION_TEMPLATE).toContain("evolution` tool")
  })
})

describe("DCP loop-hardening hook names", () => {
  test("dcp-nudge-sanitizer and nudge-loop-breaker are registered literals", () => {
    //#given the hook name schema
    //#when parsing the new hook names
    const sanitizer = HookNameSchema.safeParse("dcp-nudge-sanitizer")
    const loopBreaker = HookNameSchema.safeParse("nudge-loop-breaker")

    //#then both are accepted
    expect(sanitizer.success).toBe(true)
    expect(loopBreaker.success).toBe(true)
  })

  test("context-mode-enforcer literal is declared exactly once", () => {
    //#given the hook-name data file that now backs HookNameSchema
    const source = readFileSync(
      new URL("../../src/config/schema/hooks-v1-names.json", import.meta.url),
      "utf8",
    )

    //#when counting the literal occurrences
    const occurrences = source.split('"context-mode-enforcer"').length - 1

    //#then the duplicate is gone
    expect(occurrences).toBe(1)
  })
})

describe("T9 retrieval gating (zero-overhead)", () => {
  test("enabled=false keeps the tool gated off and retrieval empty", () => {
    //#given a disabled evolution gate and an empty store
    const emptyRoot = mkdtempSync(path.join(tmpdir(), "evolution-disabled-"))
    //#when evaluating the gate and querying the store
    const enabled = shouldEnableEvolutionTool(false)
    const hits = searchRecords(readRetrievalRecords(emptyRoot), { scope: { projectId: "proj-1" } })
    //#then the tool is unregistered and no knowledge surfaces
    expect(enabled).toBe(false)
    expect(hits).toEqual([])
  })
})
