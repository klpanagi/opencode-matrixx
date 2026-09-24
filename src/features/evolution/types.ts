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
}

export type CompressionUsage = {
  inputTokens: number
  outputTokens: number
  costCents: number
}

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
  eval_score?: number | null
  tags?: string[]
  prerequisites?: string[]
}
