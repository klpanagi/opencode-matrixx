import { z } from "zod"

/**
 * DCP (Dynamic Context Pruning) configuration.
 *
 * Controls the optional `/dcp-profile` slash command for switching between
 * predefined DCP profile tiers (economy/balanced/performance/ultimate).
 *
 * DCP must be installed as a plugin: `~/.config/opencode/node_modules/@tarquinen/opencode-dcp`
 */

// ─── Sub-schemas ──────────────────────────────────────────────────────────

export const DcpCompressOverrideSchema = z.object({
  maxContextLimit: z.union([z.number(), z.string().regex(/^\d+%$/)]).optional(),
  minContextLimit: z.union([z.number(), z.string().regex(/^\d+%$/)]).optional(),
  nudgeFrequency: z.number().int().min(1).optional(),
  iterationNudgeThreshold: z.number().int().min(1).optional(),
  nudgeForce: z.enum(["strong", "soft"]).optional(),
  protectTags: z.boolean().optional(),
  protectedTools: z.array(z.string()).optional(),
  protectUserMessages: z.boolean().optional(),
})
export type DcpCompressOverride = z.infer<typeof DcpCompressOverrideSchema>

export const DcpStrategiesOverrideSchema = z.object({
  purgeErrors: z
    .object({
      turns: z.number().int().min(1).optional(),
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

export const DcpProfileDefinitionSchema = z.object({
  pruneNotification: z.enum(["off", "minimal", "detailed"]).optional(),
  compress: DcpCompressOverrideSchema.optional(),
  turnProtection: DcpTurnProtectionSchema.optional(),
  experimental: DcpExperimentalSchema.optional(),
  strategies: DcpStrategiesOverrideSchema.optional(),
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
} as const satisfies Record<string, DcpProfileDefinition>

// ─── Root DCP config schema ─────────────────────────────────────────────

export const DcpConfigSchema = z.object({
  /** Enable the DCP profile switcher. Default: true */
  enabled: z.boolean().default(true),

  /** Profile definitions keyed by name. Defaults to the four built-in profiles. */
  profiles: z.record(z.string(), DcpProfileDefinitionSchema).default(BUILTIN_DCP_PROFILES),

  /** Default profile to activate when the command is invoked without arguments. Default: "balanced" */
  default_profile: z.string().optional(),

  /** Base/shared configuration that applies across all profiles */
  base: z
    .object({
      /** Automatically update DCP when a new version is available (default: false) */
      autoUpdate: z.boolean().default(false),

      /** Enable debug logging for DCP operations (default: false) */
      debug: z.boolean().default(false),

      /** How to deliver prune notifications: via chat message or toast popup (default: "chat") */
      pruneNotificationType: z.enum(["chat", "toast"]).default("chat"),

      /** Context compression configuration */
      compress: z
        .object({
          /** Compression mode: "range" compresses a range of messages, "message" compresses individual messages (default: "range") */
          mode: z.enum(["range", "message"]).default("range"),

          /** Permission model: "ask" prompts before compressing, "allow" auto-compresses, "deny" disables (default: "allow") */
          permission: z.enum(["ask", "allow", "deny"]).default("allow"),

          /** Show compression summary in chat after each compression (default: true) */
          showCompression: z.boolean().default(true),

          /** Keep a summary buffer for compressed content to preserve context continuity (default: true) */
          summaryBuffer: z.boolean().default(true),

          /** Force of compression nudges: "strong" is more aggressive, "soft" is gentler (default: "strong") */
          nudgeForce: z.enum(["strong", "soft"]).default("strong"),

          /** Number of consecutive iteration-based messages before a nudge is triggered (default: 5) */
          iterationNudgeThreshold: z.number().int().min(1).default(5),

          /** Tools whose outputs are protected from compression (default: []) */
          protectedTools: z.array(z.string()).default([]),

          /** Protect user messages from being compressed (default: false) */
          protectUserMessages: z.boolean().default(false),
        })
        .default({
          mode: "range",
          permission: "allow",
          showCompression: true,
          summaryBuffer: true,
          nudgeForce: "strong",
          iterationNudgeThreshold: 5,
          protectedTools: [],
          protectUserMessages: false,
        }),

      /** Strategy configurations for context management */
      strategies: z
        .object({
          deduplication: z
            .object({
              /** Enable deduplication of repeated content (default: true) */
              enabled: z.boolean().default(true),
              /** Tools excluded from deduplication (default: []) */
              protectedTools: z.array(z.string()).default([]),
            })
            .default({
              enabled: true,
              protectedTools: [],
            }),
          purgeErrors: z
            .object({
              /** Enable purging of error content from context (default: true) */
              enabled: z.boolean().default(true),
              /** Tools excluded from error purging (default: []) */
              protectedTools: z.array(z.string()).default([]),
            })
            .default({
              enabled: true,
              protectedTools: [],
            }),
        })
        .default({
          deduplication: { enabled: true, protectedTools: [] },
          purgeErrors: { enabled: true, protectedTools: [] },
        }),

      /** Slash command configuration */
      commands: z
        .object({
          /** Enable DCP-related slash commands (default: true) */
          enabled: z.boolean().default(true),
          /** Tools excluded from command interception (default: []) */
          protectedTools: z.array(z.string()).default([]),
        })
        .default({
          enabled: true,
          protectedTools: [],
        }),

      /** Manual mode configuration for user-initiated pruning */
      manualMode: z
        .object({
          /** Enable manual mode where user explicitly triggers pruning (default: false) */
          enabled: z.boolean().default(false),
          /** Run automatic strategies (deduplication, error purging) even in manual mode (default: true) */
          automaticStrategies: z.boolean().default(true),
        })
        .default({
          enabled: false,
          automaticStrategies: true,
        }),

      /** Glob patterns for files that should be protected from compression (default: []) */
      protectedFilePatterns: z.array(z.string()).default([]),
    })
    .default({
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
    }),
})

export type DcpConfig = z.infer<typeof DcpConfigSchema>
