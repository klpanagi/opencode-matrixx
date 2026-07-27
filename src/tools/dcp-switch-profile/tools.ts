import { existsSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import type { DcpConfig } from "../../config/schema/dcp"
import { BUILTIN_DCP_PROFILES } from "../../config/schema/dcp"

const DCP_PLUGIN_DIR = join(homedir(), ".config", "opencode", "node_modules", "@tarquinen", "opencode-dcp")
const DCP_SYMLINK = join(homedir(), ".config", "opencode", "dcp.jsonc")

const VALID_PROFILES = ["economy", "balanced", "performance", "ultimate"] as const

export interface DcpSwitchProfileOptions {
  pluginConfig?: { dcp?: DcpConfig }
}

/**
 * Verify DCP plugin is installed at the standard OpenCode location.
 */
function checkDcpInstalled(): string | null {
  if (!existsSync(DCP_PLUGIN_DIR)) {
    return `DCP is not installed at ${DCP_PLUGIN_DIR}. Install it with: npm install --prefix ~/.config/opencode @tarquinen/opencode-dcp`
  }
  return null
}

/**
 * Build a full inline DCP PluginConfig object for the given profile.
 * Starts with base values from dcpConfig.base, overlays profile-specific
 * values from dcpConfig.profiles[profile], and falls back to built-in
 * profile definitions when no Matrixx config is provided.
 */
function buildInlineConfig(profile: string, options?: DcpSwitchProfileOptions): Record<string, unknown> {
  const dcpConfig = options?.pluginConfig?.dcp
  const base = dcpConfig?.base ? (dcpConfig.base as Record<string, unknown>) : {}
  const validProfiles = BUILTIN_DCP_PROFILES as unknown as Record<string, Record<string, unknown>>
  const profileConfig = dcpConfig?.profiles?.[profile] ?? validProfiles[profile] ?? {}

  // Extract sub-objects with proper typing
  const compressBase = (base.compress as Record<string, unknown>) ?? {}
  const strategiesBase = (base.strategies as Record<string, unknown>) ?? {}
  const commandsCfg = (base.commands as Record<string, unknown>) ?? {}
  const manualModeCfg = (base.manualMode as Record<string, unknown>) ?? {}
  const profileCompress = (profileConfig.compress as Record<string, unknown>) ?? {}
  const profileTurn = (profileConfig.turnProtection as Record<string, unknown>) ?? {}
  const profileExp = (profileConfig.experimental as Record<string, unknown>) ?? {}
  const profilePurge = ((profileConfig.strategies as Record<string, unknown>)?.purgeErrors as Record<string, unknown>) ?? {}
  const basePurge = ((strategiesBase.purgeErrors as Record<string, unknown>)) ?? {}

  return {
    $schema:
      "https://raw.githubusercontent.com/Opencode-DCP/opencode-dynamic-context-pruning/v3.1.14/dcp.schema.json",
    enabled: true,
    autoUpdate: (base.autoUpdate as boolean) ?? false,
    debug: (base.debug as boolean) ?? false,
    pruneNotification: (profileConfig.pruneNotification as string) ?? "minimal",
    pruneNotificationType: (base.pruneNotificationType as string) ?? "chat",
    compress: {
      mode: (compressBase.mode as string) ?? "range",
      permission: (compressBase.permission as string) ?? "allow",
      showCompression: (compressBase.showCompression as boolean) ?? true,
      summaryBuffer: (compressBase.summaryBuffer as boolean) ?? true,
      maxContextLimit: (profileCompress.maxContextLimit as string | number) ?? "60%",
      minContextLimit: (profileCompress.minContextLimit as string | number) ?? "30%",
      nudgeFrequency: (profileCompress.nudgeFrequency as number) ?? 3,
      iterationNudgeThreshold:
        (profileCompress.iterationNudgeThreshold as number) ?? (compressBase.iterationNudgeThreshold as number) ?? 5,
      nudgeForce: (profileCompress.nudgeForce as string) ?? (compressBase.nudgeForce as string) ?? "strong",
      protectedTools:
        (profileCompress.protectedTools as string[]) ?? (compressBase.protectedTools as string[]) ?? [],
      protectTags: (profileCompress.protectTags as boolean) ?? false,
      protectUserMessages:
        (profileCompress.protectUserMessages as boolean) ?? (compressBase.protectUserMessages as boolean) ?? false,
    },
    turnProtection: {
      enabled: (profileTurn.enabled as boolean) ?? true,
      turns: (profileTurn.turns as number) ?? 2,
    },
    experimental: {
      allowSubAgents: (profileExp.allowSubAgents as boolean) ?? true,
      customPrompts: false,
    },
    protectedFilePatterns: (base.protectedFilePatterns as string[]) ?? [],
    commands: {
      enabled: (commandsCfg.enabled as boolean) ?? true,
      protectedTools: (commandsCfg.protectedTools as string[]) ?? [],
    },
    manualMode: {
      enabled: (manualModeCfg.enabled as boolean) ?? false,
      automaticStrategies: (manualModeCfg.automaticStrategies as boolean) ?? true,
    },
    strategies: {
      deduplication: {
        enabled: ((strategiesBase.deduplication as Record<string, unknown>)?.enabled as boolean) ?? true,
        protectedTools: ((strategiesBase.deduplication as Record<string, unknown>)?.protectedTools as string[]) ?? [],
      },
      purgeErrors: {
        enabled: (basePurge.enabled as boolean) ?? true,
        turns: (profilePurge.turns as number) ?? 2,
        protectedTools: (basePurge.protectedTools as string[]) ?? [],
      },
    },
  }
}

/**
 * Switch the active DCP profile.
 * Reads profile parameters from the Matrixx plugin configuration and writes
 * a full inline DCP config to ~/.config/opencode/dcp.jsonc.
 */
function switchProfile(profile: string, options?: DcpSwitchProfileOptions): string {
  // Validate profile
  if (!VALID_PROFILES.includes(profile as (typeof VALID_PROFILES)[number])) {
    return `Error: Invalid profile "${profile}". Valid profiles: ${VALID_PROFILES.join(", ")}`
  }

  // Check DCP installation
  const dcpError = checkDcpInstalled()
  if (dcpError) return dcpError

  // Build the full inline config from Matrixx configuration
  const inlineConfig = buildInlineConfig(profile, options)

  // Write directly to the DCP config symlink target
  writeFileSync(DCP_SYMLINK, JSON.stringify(inlineConfig, null, 2) + "\n")

  return `\u2713 Switched to DCP profile: ${profile}\n\nRestart OpenCode session for changes to take effect.`
}

export function createDcpSwitchProfileTool(options?: DcpSwitchProfileOptions): Record<string, ToolDefinition> {
  const dcp_switch_profile: ToolDefinition = tool({
    description:
      "Switch the active DCP (Dynamic Context Pruning) profile tier. " +
      "Reads profile parameters from the Matrixx plugin configuration and writes a full inline DCP config " +
      "to ~/.config/opencode/dcp.jsonc. No external files needed. " +
      "Call this with one of: economy, balanced, performance, ultimate.",
    args: {
      profile: tool.schema
        .enum(VALID_PROFILES)
        .describe(
          "Target DCP profile tier: economy (most aggressive), balanced, performance, ultimate (least aggressive)",
        ),
    },
    async execute(args) {
      const profile = args.profile as string
      return switchProfile(profile, options)
    },
  })

  return { dcp_switch_profile }
}
