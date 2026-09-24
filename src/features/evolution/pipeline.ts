import * as path from "node:path"
import type { EvolutionConfig } from "../../config/schema/evolution"
import { passesQualityGate } from "../../hooks/evolution-quality-gate"
import { createCompressor } from "./compressor"
import type { LlmCall, LlmUsage } from "./compressor/interface"
import {
  checkPendingCapacity,
  EVOLUTION_DIR,
  isOverDailyCap,
  loadLedger,
  MaxPendingError,
  recordUsageToDisk,
  resolveProjectIdentity,
  traceStore,
} from "./store"
import type { CompressionInput } from "./types"
import { EvolutionWriter } from "./writer"

function evolutionDir(): string {
  return path.resolve(process.cwd(), EVOLUTION_DIR)
}

export async function runEvolutionPipeline(
  input: CompressionInput,
  config: EvolutionConfig,
  llmCall?: LlmCall,
): Promise<{ staged?: string; promoted?: string; reason?: string; usage?: LlmUsage }> {
  try {
    const writer = new EvolutionWriter(config.writer)
    const pending = await writer.listPending()
    try {
      checkPendingCapacity(pending.length, config.retention.maxPending)
    } catch (error) {
      if (error instanceof MaxPendingError) {
        await traceStore.appendAudit({
          action: "max-pending",
          sessionID: input.sessionID,
          pending: error.pending,
          maxPending: error.maxPending,
        })
        return { reason: "max-pending" }
      }
      throw error
    }

    const dir = evolutionDir()
    const ledger = loadLedger(dir)
    // Over the daily cost cap the paid LLM path is blocked, but the free
    // heuristic must still run: pass `undefined` so createCompressor degrades
    // to offline mode and returns no usage (hence no charge).
    const effectiveLlmCall = isOverDailyCap(ledger, config.budget.maxCostCentsPerDay) ? undefined : llmCall
    const compressor = createCompressor(config.compressor, effectiveLlmCall)
    const { knowledge, usage } = await compressor.compress(input)
    knowledge.projectId = resolveProjectIdentity(process.cwd()).projectId
    if (usage) recordUsageToDisk(dir, usage)

    const gate = passesQualityGate(knowledge, config.governance)
    if (!gate.pass) {
      await traceStore.appendAudit({ action: "gate-rejected", title: knowledge.title, reason: gate.reason })
      return { reason: gate.reason ?? "gate-rejected" }
    }
    const { slug } = await writer.stage(knowledge)
    if (config.governance.autoPromote && knowledge.confidence >= (config.governance.autoPromoteThreshold ?? 0.85)) {
      const { promotedPath } = await writer.promote(slug)
      return { staged: slug, promoted: promotedPath, usage }
    }
    return { staged: slug, usage }
  } catch (e) {
    await traceStore.appendAudit({ action: "pipeline-error", error: String(e) })
    return { reason: String(e) }
  }
}
