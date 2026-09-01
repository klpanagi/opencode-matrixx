import type { EvolutionGovernanceConfig } from "../../config/schema/evolution"
import type { DistilledKnowledge } from "../../features/evolution/types"

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{30,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN .*PRIVATE KEY-----/,
  /xox[bpras]-[0-9A-Za-z-]+/,
]

function containsSecret(text: string): boolean {
  for (const re of SECRET_PATTERNS) {
    if (re.test(text)) return true
  }
  return false
}

export function passesQualityGate(
  knowledge: DistilledKnowledge,
  config: EvolutionGovernanceConfig,
): { pass: boolean; reason?: string } {
  const minConfidence = config.minConfidence ?? 0.7
  if (knowledge.confidence < minConfidence) {
    return { pass: false, reason: `confidence ${knowledge.confidence} < ${minConfidence}` }
  }
  if (!knowledge.skillDraft && !knowledge.summary) {
    return { pass: false, reason: "empty skillDraft and summary" }
  }
  const aggregated =
    (knowledge.skillDraft ?? "") +
    knowledge.summary +
    knowledge.patterns.join("") +
    knowledge.pitfalls.join("")
  if (containsSecret(aggregated)) {
    return { pass: false, reason: "potential secret detected" }
  }
  if (!knowledge.title.trim()) {
    return { pass: false, reason: "empty title" }
  }
  if (!knowledge.summary.trim()) {
    return { pass: false, reason: "empty summary" }
  }
  return { pass: true }
}
