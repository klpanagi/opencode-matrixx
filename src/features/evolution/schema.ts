import { z } from "zod"
import type { KnowledgeKind } from "./types"

/**
 * D5 typed knowledge kinds — DATA schemas (not config knobs).
 *
 * The `KnowledgeKind` union lives in `./types` (single source); this module
 * owns the Zod runtime schema plus the fail-open normalizer used on every
 * read path (LLM output, stored JSON, legacy meta.json without `kind`).
 */

export const KNOWLEDGE_KINDS = ["workflow", "correction", "debugging_pattern", "gotcha", "convention"] as const

export const KnowledgeKindSchema = z.enum(KNOWLEDGE_KINDS)

export const DEFAULT_KNOWLEDGE_KIND: KnowledgeKind = "convention"

/**
 * Fail-open normalizer: valid kinds pass through, missing/unknown values
 * become `convention` instead of throwing (back-compat for stored JSON).
 */
export function normalizeKnowledgeKind(value: unknown): KnowledgeKind {
  const parsed = KnowledgeKindSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_KNOWLEDGE_KIND
}

/** Data-shape schema for distilled knowledge (stored/LLM JSON, not config). */
export const DistilledKnowledgeDataSchema = z.object({
  title: z.string(),
  summary: z.string(),
  patterns: z.array(z.string()),
  pitfalls: z.array(z.string()),
  prerequisites: z.array(z.string()),
  skillDraft: z.string().optional(),
  confidence: z.number(),
  sourceSessionIDs: z.array(z.string()),
  kind: KnowledgeKindSchema.optional().default(DEFAULT_KNOWLEDGE_KIND),
  projectId: z.string().optional(),
  sourceTraceIDs: z.array(z.string()).optional().default([]),
  distilledAt: z.string().optional(),
  superseded_by: z.string().optional(),
})

export type DistilledKnowledgeData = z.infer<typeof DistilledKnowledgeDataSchema>
