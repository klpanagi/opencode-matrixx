import { z } from "zod"

/**
 * DCP (Dynamic Context Pruning) configuration.
 *
 * Selects between predefined DCP profile tiers
 * (economy/balanced/performance/ultimate) via `dcp.default_profile`.
 *
 * DCP must be installed as a plugin: `~/.config/opencode/node_modules/@tarquinen/opencode-dcp`
 */

// ─── Sub-schemas ──────────────────────────────────────────────────────────

const dcpLimitValue = z.union([z.number(), z.string().regex(/^\d+%$/)])
const dcpModelLimitKey = z.string().regex(/^[^/]+\/[^/]+$/)

export const DcpCompressOverrideSchema = z.object({
  mode: z.enum(["range", "message"]).optional(),
  permission: z.enum(["ask", "allow", "deny"]).optional(),
  showCompression: z.boolean().optional(),
  summaryBuffer: z.boolean().optional(),
  maxContextLimit: z.union([z.number(), z.string().regex(/^\d+%$/)]).optional(),
  minContextLimit: z.union([z.number(), z.string().regex(/^\d+%$/)]).optional(),
  modelMaxLimits: z.record(dcpModelLimitKey, dcpLimitValue).optional(),
  modelMinLimits: z.record(dcpModelLimitKey, dcpLimitValue).optional(),
  nudgeFrequency: z.number().int().min(1).optional(),
  iterationNudgeThreshold: z.number().int().min(1).optional(),
  nudgeForce: z.enum(["strong", "soft"]).optional(),
  protectTags: z.boolean().optional(),
  protectedTools: z.array(z.string()).optional(),
  protectUserMessages: z.boolean().optional(),
})
export type DcpCompressOverride = z.infer<typeof DcpCompressOverrideSchema>

export const DcpStrategiesOverrideSchema = z.object({
  deduplication: z
    .object({
      enabled: z.boolean().optional(),
      protectedTools: z.array(z.string()).optional(),
    })
    .optional(),
  purgeErrors: z
    .object({
      enabled: z.boolean().optional(),
      turns: z.number().int().min(1).optional(),
      protectedTools: z.array(z.string()).optional(),
    })
    .optional(),
})
export type DcpStrategiesOverride = z.infer<typeof DcpStrategiesOverrideSchema>

export const DcpTurnProtectionSchema = z.object({
  enabled: z.boolean().optional(),
  turns: z.number().int().min(1).optional(),
})
export type DcpTurnProtection = z.infer<typeof DcpTurnProtectionSchema>

export const DcpExperimentalSchema = z.object({
  allowSubAgents: z.boolean().optional(),
})
export type DcpExperimental = z.infer<typeof DcpExperimentalSchema>

export const DcpCommandsSchema = z.object({
  enabled: z.boolean().optional(),
  protectedTools: z.array(z.string()).optional(),
})
export type DcpCommands = z.infer<typeof DcpCommandsSchema>

export const DcpManualModeSchema = z.object({
  enabled: z.boolean().optional(),
  automaticStrategies: z.boolean().optional(),
})
export type DcpManualMode = z.infer<typeof DcpManualModeSchema>

export const DcpProfileDefinitionSchema = z.object({
  pruneNotification: z.enum(["off", "minimal", "detailed"]).optional(),
  pruneNotificationType: z.enum(["chat", "toast"]).optional(),
  autoUpdate: z.boolean().optional(),
  debug: z.boolean().optional(),
  compress: DcpCompressOverrideSchema.optional(),
  turnProtection: DcpTurnProtectionSchema.optional(),
  experimental: DcpExperimentalSchema.optional(),
  strategies: DcpStrategiesOverrideSchema.optional(),
  commands: DcpCommandsSchema.optional(),
  manualMode: DcpManualModeSchema.optional(),
  protectedFilePatterns: z.array(z.string()).optional(),
})
export type DcpProfileDefinition = z.infer<typeof DcpProfileDefinitionSchema>

// ─── Built-in profiles ───────────────────────────────────────────────────

export const BUILTIN_DCP_PROFILES = {
  economy: {
    pruneNotification: "off" as const,
    compress: {
      maxContextLimit: "30%",
      minContextLimit: "20%",
      nudgeFrequency: 2,
      nudgeForce: "strong" as const,
      iterationNudgeThreshold: 7,
    },
    turnProtection: { enabled: false },
    experimental: { allowSubAgents: false },
    strategies: { purgeErrors: { turns: 1 } },
  },
  balanced: {
    pruneNotification: "minimal" as const,
    compress: {
      maxContextLimit: "60%",
      minContextLimit: "30%",
      nudgeFrequency: 3,
      nudgeForce: "strong" as const,
      iterationNudgeThreshold: 10,
    },
    turnProtection: { enabled: true, turns: 2 },
    experimental: { allowSubAgents: true },
    strategies: { purgeErrors: { turns: 2 } },
  },
  performance: {
    pruneNotification: "minimal" as const,
    compress: {
      maxContextLimit: "80%",
      minContextLimit: "35%",
      nudgeFrequency: 4,
      nudgeForce: "strong" as const,
      iterationNudgeThreshold: 12,
    },
    turnProtection: { enabled: true, turns: 3 },
    experimental: { allowSubAgents: true },
    strategies: { purgeErrors: { turns: 2 } },
  },
  ultimate: {
    pruneNotification: "detailed" as const,
    compress: {
      maxContextLimit: "85%",
      minContextLimit: "40%",
      nudgeFrequency: 5,
      nudgeForce: "strong" as const,
      iterationNudgeThreshold: 15,
      protectTags: true,
    },
    turnProtection: { enabled: true, turns: 5 },
    experimental: { allowSubAgents: true },
    strategies: { purgeErrors: { turns: 4 } },
  },
  brutal: {
    pruneNotification: "off" as const,
    compress: {
      maxContextLimit: "20%",
      minContextLimit: "10%",
      nudgeFrequency: 2,
      nudgeForce: "strong" as const,
      iterationNudgeThreshold: 6,
    },
    turnProtection: { enabled: false },
    experimental: { allowSubAgents: false },
    strategies: { purgeErrors: { turns: 1 } },
  },
} as const satisfies Record<string, DcpProfileDefinition>

// ─── Shared defaults (applied to every profile) ───────────────────────────
// Formerly `dcp.base`. The `base` section was removed because Zod-filled
// defaults made it unable to overwrite builtin profile values. Override any
// of these per profile via `dcp.profiles.<name>` (profile name as key).
export const DEFAULT_DCP_SHARED = {
  autoUpdate: false,
  debug: false,
  pruneNotificationType: "chat",
  compress: {
    mode: "range",
    permission: "allow",
    showCompression: true,
    summaryBuffer: true,
    nudgeForce: "strong",
    iterationNudgeThreshold: 5,
    protectedTools: [],
    protectUserMessages: false,
  },
  strategies: {
    deduplication: { enabled: true, protectedTools: [] },
    purgeErrors: { enabled: true, protectedTools: [] },
  },
  commands: { enabled: true, protectedTools: [] },
  manualMode: { enabled: false, automaticStrategies: true },
  protectedFilePatterns: [],
  experimental: { allowSubAgents: true },
} as const

// ─── Handoff compression schema ─────────────────────────────────────────

/**
 * Configuration for compressing background task results when sending
 * completion notifications to the parent session (handoff boundary).
 *
 * When enabled, assistant messages beyond `maxMessages` are truncated:
 * the first `keepFirst` and last `keepLast` messages are preserved,
 * with a "[... N messages truncated]" marker inserted between them.
 * This reduces the context cost of notifying the parent session.
 */
export const DcpHandoffCompressionSchema = z.object({
  /** Enable handoff boundary compression (default: true) */
  enabled: z.boolean().default(true),
  /** Max assistant messages before truncation kicks in (default: 6) */
  maxMessages: z.number().int().min(1).default(6),
  /** Number of leading messages to keep (default: 2) */
  keepFirst: z.number().int().min(0).default(2),
  /** Number of trailing messages to keep (default: 3) */
  keepLast: z.number().int().min(0).default(3),
})
export type DcpHandoffCompression = z.infer<typeof DcpHandoffCompressionSchema>

// ─── Root DCP config schema ─────────────────────────────────────────────

export const DcpConfigSchema = z.object({
  /** Enable the DCP profile switcher. Default: true */
  enabled: z.boolean().default(true),

  /** Per-profile overrides keyed by profile name. Builtins apply when unset. */
  profiles: z.record(z.string(), DcpProfileDefinitionSchema).default({}),

  /** Default profile to activate when the command is invoked without arguments. Default: "balanced" */
  default_profile: z.string().optional(),

  /** Handoff compression configuration for background task results */
  handoffCompression: DcpHandoffCompressionSchema.default({
    enabled: true,
    maxMessages: 6,
    keepFirst: 2,
    keepLast: 3,
  }),
})

export type DcpConfig = z.infer<typeof DcpConfigSchema>
