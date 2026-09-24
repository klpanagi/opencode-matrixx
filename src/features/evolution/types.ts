export type TraceRecord = {
  id: string
  sessionID: string
  callID: string
  timestamp: string
  agent: string
  tool: string
  args: unknown
  output: string
  durationMs: number
  success: boolean
  errorType?: string
  model?: string
}

export type KnowledgeKind = "workflow" | "correction" | "debugging_pattern" | "gotcha" | "convention"

/** Project scope used when git identity is unknown (T4a contract; populated by T5). */
export const UNSCOPED_LEGACY = "unscoped-legacy"

export type DistilledKnowledge = {
  title: string
  summary: string
  patterns: string[]
  pitfalls: string[]
  prerequisites: string[]
  skillDraft?: string
  confidence: number
  sourceSessionIDs: string[]
  kind: KnowledgeKind
  /** Git-derived project scope; absent normalizes to UNSCOPED_LEGACY. Populated by T5. */
  projectId?: string
  /** Trace ids backing this distillation; absent defaults to []. */
  sourceTraceIDs: string[]
  /** ISO timestamp of distillation; absent is back-filled at parse time. */
  distilledAt: string
}

export type CompressionUsage = {
  inputTokens: number
  outputTokens: number
  costCents: number
}

/**
 * Cost/usage channel (T4a): `compress()` resolves to `{ knowledge, usage? }` with
 * `usage = { inputTokens, outputTokens, costCents }`. T1 emits it, T3 (budget-ledger)
 * consumes it, T8 provenance cites it. No separate store-appended ledger event.
 */
export type CompressResult = {
  knowledge: DistilledKnowledge
  usage?: CompressionUsage
}
export type CompressionInput = {
  sessionID: string
  traces: TraceRecord[]
  messages?: unknown[]
  notepads?: string[]
  handoff?: unknown
  taskHistory?: unknown[]
}

export interface Compressor {
  compress(input: CompressionInput): Promise<CompressResult>
}

export type EvolutionState = {
  totalTraces: number
  totalCompressions: number
  lastCompressionAt?: string
  lastPromptAt?: string
}

export type SkillMeta = {
  name: string
  version: string
  derived_from: string[]
  created_at: string
  confidence: number
  kind?: KnowledgeKind
  /** Git-derived project scope; absent/failing back-compat normalizes to unscoped. */
  projectId?: string
  eval_score?: number | null
  tags?: string[]
  prerequisites?: string[]
  /** Live-head pointer set on an old artifact when a later re-distill replaces it. */
  superseded_by?: string
  /** Canonical title slug shared across a supersede chain (old + new coexist). */
  base_slug?: string
  /** Content hash used to detect byte-identical re-distills (idempotent suppression). */
  content_hash?: string
}
