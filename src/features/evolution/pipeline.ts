import type { EvolutionConfig } from "../../config/schema/evolution"
import { passesQualityGate } from "../../hooks/evolution-quality-gate"
import { createCompressor } from "./compressor"
import { traceStore } from "./store"
import type { CompressionInput } from "./types"
import { EvolutionWriter } from "./writer"

export async function runEvolutionPipeline(
  input: CompressionInput,
  config: EvolutionConfig,
): Promise<{ staged?: string; promoted?: string; reason?: string }> {
  try {
    const compressor = createCompressor(config.compressor)
    const knowledge = await compressor.compress(input)
    const gate = passesQualityGate(knowledge, config.governance)
    if (!gate.pass) {
      await traceStore.appendAudit({ action: "gate-rejected", title: knowledge.title, reason: gate.reason })
      return { reason: gate.reason ?? "gate-rejected" }
    }
    const writer = new EvolutionWriter(config.writer)
    const { slug } = await writer.stage(knowledge)
    if (config.governance.autoPromote && knowledge.confidence >= (config.governance.autoPromoteThreshold ?? 0.85)) {
      const { promotedPath } = await writer.promote(slug)
      return { staged: slug, promoted: promotedPath }
    }
    return { staged: slug }
  } catch (e) {
    await traceStore.appendAudit({ action: "pipeline-error", error: String(e) })
    return { reason: String(e) }
  }
}
