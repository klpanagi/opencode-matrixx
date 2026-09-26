import type { EvolutionConfig } from "../../config/schema/evolution"
import { V1_HOOK_KEYS } from "../../config/schema/hooks-v1-keys"
import type { LlmCall } from "../../features/evolution/compressor/interface"
import { evaluatePromotedSkills } from "../../features/evolution/evaluator"
import { runEvolutionPipeline } from "../../features/evolution/pipeline"
import { traceStore } from "../../features/evolution/store"
import type { CompressionInput } from "../../features/evolution/types"
import { EvolutionWriter } from "../../features/evolution/writer"
import type { PluginContext } from "../../plugin/types"
import { log } from "../../shared/logger"
import { createHostLlmCall } from "./host-llm-call"

function resolveConfig(a?: unknown, b?: unknown): EvolutionConfig | undefined {
  if (b && typeof b === "object" && "enabled" in (b as Record<string, unknown>)) return b as EvolutionConfig
  if (a && typeof a === "object" && "enabled" in (a as Record<string, unknown>)) return a as EvolutionConfig
  return undefined
}

function resolveContext(a?: PluginContext | EvolutionConfig): PluginContext | undefined {
  if (a && typeof a === "object" && "client" in (a as Record<string, unknown>)) return a as PluginContext
  return undefined
}

export function createEvolutionCompressorHook(a?: PluginContext | EvolutionConfig, b?: EvolutionConfig) {
  const config = resolveConfig(a, b)
  const ctx = resolveContext(a)
  const hostLlmCall: LlmCall | undefined = ctx?.client
    ? createHostLlmCall({ client: ctx.client, directory: ctx.directory, model: config?.compressor?.model })
    : undefined

  const shouldThrottle = async (): Promise<boolean> => {
    try {
      // Pending-full short-circuit: a full staging queue makes any compression
      // pointless, so skip before spending tokens. The daily cost cap is
      // deliberately NOT a throttle condition — the pipeline downgrades to the
      // free heuristic when over cap, and skipping would lose that value.
      if (config) {
        const maxPending = config.retention?.maxPending ?? 50
        const pending = await new EvolutionWriter(config.writer).listPending()
        if (pending.length >= maxPending) return true
      }
      const state = await traceStore.getState()
      const last = state.lastCompressionAt
      if (!last) return false
      const maxPerHour = config?.budget?.maxCompressionsPerHour ?? 10
      const interval = (60 * 60 * 1000) / maxPerHour
      const elapsed = Date.now() - new Date(last).getTime()
      if (Number.isNaN(elapsed)) return false
      return elapsed < interval
    } catch {
      return false
    }
  }

  const runCompression = async (trigger: string, sessionID: string): Promise<unknown | null> => {
    try {
      if (!config?.enabled) return null
      if (await shouldThrottle()) return null
      const traces = traceStore.getRecent(100)
      if (traces.length === 0) return null
      const filtered = sessionID && sessionID !== "unknown" ? traces.filter((t) => t.sessionID === sessionID) : traces
      const effective = filtered.length > 0 ? filtered : traces
      const minTraces = config.compressor?.minTraces ?? 5
      if (effective.length < minTraces) return null
      const input: CompressionInput = { sessionID, traces: effective }
      const result = await runEvolutionPipeline(input, config, hostLlmCall)
      if (!result.staged && !result.promoted) return null
      const state = await traceStore.getState()
      await traceStore.updateState({ lastCompressionAt: new Date().toISOString(), totalCompressions: (state.totalCompressions ?? 0) + 1 })
      await traceStore.appendAudit({ trigger, sessionID, staged: result.staged, promoted: result.promoted })
      try {
        await traceStore.cleanup(config.retention?.traceDays ?? 30)
      } catch (cleanupError) {
        log("[evolution-compressor] retention cleanup failed", { error: String(cleanupError) })
      }
      log(`[evolution-compressor] staged=${result.staged} promoted=${result.promoted} trigger=${trigger}`)
      return result
    } catch (e) {
      log("[evolution-compressor] failed", { error: String(e) })
      return null
    }
  }

  return {
    event: async (input: { event: { type: string; properties?: Record<string, unknown> } }): Promise<void> => {
      try {
        const evt = input.event
        const type = evt.type
        if (type !== "session.idle" && type !== "session.error" && type !== "session.compacted") return
        const props = evt.properties as Record<string, unknown> | undefined
        const sessionID = (props?.sessionID as string | undefined) ?? (props?.info as { id?: string } | undefined)?.id ?? "unknown"
        if (config?.enabled && type === "session.idle") {
          await evaluatePromotedSkills({ projectRoot: ctx?.directory })
        }
        const triggerCfg = config?.compressor?.trigger ?? "both"
        if (triggerCfg === "compacting" && type === "session.idle") return
        if (triggerCfg === "idle" && type === "session.compacted") return
        await runCompression(type, sessionID)
      } catch {}
    },
    [V1_HOOK_KEYS.sessionCompacting]: async (input: { sessionID: string }, _output: { context: string[] }): Promise<void> => {
      try {
        const triggerCfg = config?.compressor?.trigger ?? "both"
        if (triggerCfg === "idle") return
        const sessionID = input?.sessionID ?? "unknown"
        await runCompression("compacting", sessionID)
      } catch {}
    },
  }
}
