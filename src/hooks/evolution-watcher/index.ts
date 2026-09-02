import type { EvolutionConfig } from "../../config/schema/evolution"
import { traceStore } from "../../features/evolution/store"
import type { TraceRecord } from "../../features/evolution/types"
import type { PluginContext } from "../../plugin/types"
import { classifySuccess, truncate } from "./utils"

export { classifySuccess, truncate } from "./utils"

function resolveConfig(a?: unknown, b?: EvolutionConfig): EvolutionConfig | undefined {
  if (b !== undefined) return b
  if (a && typeof a === "object" && "enabled" in (a as Record<string, unknown>)) {
    return a as EvolutionConfig
  }
  return undefined
}

function getAgentName(metadata: Record<string, unknown>): string {
  const typed = metadata as { agent?: unknown; agentName?: unknown }
  const candidate = typed.agent ?? typed.agentName
  if (typeof candidate === "string" && candidate.length > 0) return candidate
  return "unknown"
}

function getModelName(metadata: Record<string, unknown>): string | undefined {
  const typed = metadata as { model?: unknown }
  const candidate = typed.model
  if (typeof candidate === "string" && candidate.length > 0) return candidate
  return undefined
}

function randomId(): string {
  try {
    const c = globalThis.crypto as Crypto | undefined
    if (c && typeof c.randomUUID === "function") return c.randomUUID()
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createEvolutionWatcherHook(a?: PluginContext | EvolutionConfig, b?: EvolutionConfig) {
  const config = resolveConfig(a, b)
  const startTimes = new Map<string, number>()
  const pendingArgs = new Map<string, string>()

  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> },
    ): Promise<void> => {
      try {
        if (!config?.enabled) return
        const watcher = config.watcher
        const skipTools: string[] = watcher?.skipTools ?? ["evolution-watcher", "evolution-compressor"]
        if (input.tool.startsWith("evolution")) return
        if (skipTools.includes(input.tool)) return
        const maxArgChars = watcher?.maxArgChars ?? 4000
        let argsStr = ""
        try {
          argsStr = JSON.stringify(output.args ?? {})
        } catch {
          argsStr = String(output.args)
        }
        pendingArgs.set(input.callID, truncate(argsStr, maxArgChars))
        startTimes.set(input.callID, Date.now())
      } catch {}
    },

    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: Record<string, unknown> },
    ): Promise<void> => {
      try {
        const start = startTimes.get(input.callID)
        const argsStr = pendingArgs.get(input.callID)
        startTimes.delete(input.callID)
        pendingArgs.delete(input.callID)

        if (!config?.enabled) return
        const watcher = config.watcher
        const skipTools: string[] = watcher?.skipTools ?? ["evolution-watcher", "evolution-compressor"]
        if (input.tool.startsWith("evolution")) return
        if (skipTools.includes(input.tool)) return

        const maxOutputChars = watcher?.maxOutputChars ?? 8000
        const rawOutput = typeof output.output === "string" ? output.output : String(output.output ?? "")
        const truncatedOutput = truncate(rawOutput, maxOutputChars)
        const durationMs = start ? Date.now() - start : 0
        const classified = classifySuccess(input.tool, rawOutput)
        const metadata = (output.metadata ?? {}) as Record<string, unknown>

        const record: TraceRecord = {
          id: randomId(),
          sessionID: input.sessionID,
          callID: input.callID,
          timestamp: new Date().toISOString(),
          agent: getAgentName(metadata),
          tool: input.tool,
          args: argsStr ?? "",
          output: truncatedOutput,
          durationMs,
          success: classified.success,
          errorType: classified.errorType,
          model: getModelName(metadata),
        }

        await traceStore.append(record)
        try {
          const state = await traceStore.getState()
          await traceStore.updateState({ totalTraces: (state.totalTraces ?? 0) + 1 })
        } catch {}
      } catch {}
    },
  }
}
