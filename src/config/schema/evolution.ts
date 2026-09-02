import { z } from "zod"

export const EvolutionWatcherConfigSchema = z
  .object({
    /** Max characters captured from tool arguments (default: 4000) */
    maxArgChars: z.number().int().min(1).default(4000),
    /** Max characters captured from tool outputs (default: 8000) */
    maxOutputChars: z.number().int().min(1).default(8000),
    /** Tool names excluded from trace capture (default: ["evolution-watcher", "evolution-compressor"]) */
    skipTools: z.array(z.string()).default(["evolution-watcher", "evolution-compressor"]),
  })
  .default({
    maxArgChars: 4000,
    maxOutputChars: 8000,
    skipTools: ["evolution-watcher", "evolution-compressor"],
  })

export type EvolutionWatcherConfig = z.infer<typeof EvolutionWatcherConfigSchema>

export const EvolutionCompressorConfigSchema = z
  .object({
    /** Compressor provider (default: "llm") */
    provider: z.enum(["llm", "dspy-gepa"]).default("llm"),
    /** Model override for the compressor LLM */
    model: z.string().optional(),
    /** Minimum traces required before compression (default: 5) */
    minTraces: z.number().int().min(1).default(5),
    /** Maximum input tokens for the compressor prompt (default: 32000) */
    maxInputTokens: z.number().int().min(1000).default(32000),
    /** When to trigger compression (default: "both") */
    trigger: z.enum(["compacting", "idle", "both"]).default("both"),
  })
  .default({
    provider: "llm" as const,
    minTraces: 5,
    maxInputTokens: 32000,
    trigger: "both" as const,
  })

export type EvolutionCompressorConfig = z.infer<typeof EvolutionCompressorConfigSchema>

export const EvolutionWriterConfigSchema = z
  .object({
    /** Output directory for generated skills (default: ".matrixx/evolution/skills") */
    outputDir: z.string().default(".matrixx/evolution/skills"),
    /** Whether generated skills are written globally (default: false) */
    globalSkills: z.boolean().default(false),
    /** Allow generation of new tools (default: false) */
    allowToolGeneration: z.boolean().default(false),
    /** Allow generation of new agents (default: false) */
    allowAgentGeneration: z.boolean().default(false),
  })
  .default({
    outputDir: ".matrixx/evolution/skills",
    globalSkills: false,
    allowToolGeneration: false,
    allowAgentGeneration: false,
  })

export type EvolutionWriterConfig = z.infer<typeof EvolutionWriterConfigSchema>

export const EvolutionGovernanceConfigSchema = z
  .object({
    /** Require human approval before promoting a skill (default: true) */
    requireApproval: z.boolean().default(true),
    /** Automatically promote high-confidence skills without approval (default: false) */
    autoPromote: z.boolean().default(false),
    /** Confidence threshold for auto-promotion (default: 0.85) */
    autoPromoteThreshold: z.number().min(0).max(1).default(0.85),
    /** Minimum confidence required to stage a skill for approval (default: 0.7) */
    minConfidence: z.number().min(0).max(1).default(0.7),
  })
  .default({
    requireApproval: true,
    autoPromote: false,
    autoPromoteThreshold: 0.85,
    minConfidence: 0.7,
  })

export type EvolutionGovernanceConfig = z.infer<typeof EvolutionGovernanceConfigSchema>

export const EvolutionRetentionConfigSchema = z
  .object({
    /** Days to retain trace files (default: 30) */
    traceDays: z.number().int().min(1).default(30),
    /** Maximum number of pending proposals retained (default: 50) */
    maxPending: z.number().int().min(1).default(50),
  })
  .default({
    traceDays: 30,
    maxPending: 50,
  })

export type EvolutionRetentionConfig = z.infer<typeof EvolutionRetentionConfigSchema>

export const EvolutionBudgetConfigSchema = z
  .object({
    /** Maximum compressions per hour (default: 10) */
    maxCompressionsPerHour: z.number().int().min(1).default(10),
    /** Maximum cost in cents per day for compression (default: 100) */
    maxCostCentsPerDay: z.number().int().min(0).default(100),
  })
  .default({
    maxCompressionsPerHour: 10,
    maxCostCentsPerDay: 100,
  })

export type EvolutionBudgetConfig = z.infer<typeof EvolutionBudgetConfigSchema>

export const EvolutionConfigSchema = z.object({
  /** Enable the self-evolution loop (default: false — opt-in feature) */
  enabled: z.boolean().default(false),
  /** Watcher configuration for trace capture */
  watcher: EvolutionWatcherConfigSchema,
  /** Compressor configuration for trace synthesis */
  compressor: EvolutionCompressorConfigSchema,
  /** Writer configuration for skill generation */
  writer: EvolutionWriterConfigSchema,
  /** Governance configuration for approval and promotion */
  governance: EvolutionGovernanceConfigSchema,
  /** Retention configuration for traces and pending proposals */
  retention: EvolutionRetentionConfigSchema,
  /** Budget configuration for compression throttling and cost */
  budget: EvolutionBudgetConfigSchema,
})

export type EvolutionConfig = z.infer<typeof EvolutionConfigSchema>
