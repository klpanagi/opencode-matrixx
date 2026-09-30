import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { DcpConfig } from "../config/schema/dcp"
import { BUILTIN_DCP_PROFILES, DEFAULT_DCP_SHARED } from "../config/schema/dcp"

const DCP_PLUGIN_DIR = join(homedir(), ".config", "opencode", "node_modules", "@tarquinen", "opencode-dcp")
const DCP_SYMLINK = join(homedir(), ".config", "opencode", "dcp.jsonc")

const VALID_PROFILES = ["economy", "balanced", "performance", "ultimate", "brutal"] as const

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

export function deepMergeProfile(
  builtin: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...builtin }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    const baseValue = result[key]
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      baseValue !== null &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue)
    ) {
      result[key] = deepMergeProfile(
        baseValue as Record<string, unknown>,
        value as Record<string, unknown>,
      )
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * Build a full inline DCP PluginConfig object for the given profile.
 * Merges shared defaults with the builtin profile, then overlays
 * dcp.profiles[profile] (profile name as key).
 */
export function buildInlineConfig(profile: string, options?: DcpSwitchProfileOptions): Record<string, unknown> {
  const dcpConfig = options?.pluginConfig?.dcp
  const validProfiles = BUILTIN_DCP_PROFILES as unknown as Record<string, Record<string, unknown>>
  const builtinProfile = validProfiles[profile] ?? {}
  const userOverride = (dcpConfig?.profiles?.[profile] as unknown as Record<string, unknown> | undefined) ?? {}
  const shared = DEFAULT_DCP_SHARED as unknown as Record<string, unknown>
  const merged = deepMergeProfile(
    deepMergeProfile(structuredClone(shared) as unknown as Record<string, unknown>, builtinProfile),
    userOverride,
  )
  const compress = (merged.compress as Record<string, unknown>) ?? {}
  const strategies = (merged.strategies as Record<string, unknown>) ?? {}
  const deduplication = (strategies.deduplication as Record<string, unknown>) ?? {}
  const purgeErrors = (strategies.purgeErrors as Record<string, unknown>) ?? {}
  const turnProtection = (merged.turnProtection as Record<string, unknown>) ?? {}
  const experimental = (merged.experimental as Record<string, unknown>) ?? {}
  const commands = (merged.commands as Record<string, unknown>) ?? {}
  const manualMode = (merged.manualMode as Record<string, unknown>) ?? {}

  return {
    $schema:
      "https://raw.githubusercontent.com/Opencode-DCP/opencode-dynamic-context-pruning/v3.1.14/dcp.schema.json",
    enabled: true,
    autoUpdate: (merged.autoUpdate as boolean) ?? false,
    debug: (merged.debug as boolean) ?? false,
    pruneNotification: (merged.pruneNotification as string) ?? "minimal",
    pruneNotificationType: (merged.pruneNotificationType as string) ?? "chat",
    compress: {
      mode: (compress.mode as string) ?? "range",
      permission: (compress.permission as string) ?? "allow",
      showCompression: (compress.showCompression as boolean) ?? true,
      summaryBuffer: (compress.summaryBuffer as boolean) ?? true,
      maxContextLimit: (compress.maxContextLimit as string | number) ?? "60%",
      minContextLimit: (compress.minContextLimit as string | number) ?? "30%",
      nudgeFrequency: (compress.nudgeFrequency as number) ?? 3,
      iterationNudgeThreshold: (compress.iterationNudgeThreshold as number) ?? 5,
      nudgeForce: (compress.nudgeForce as string) ?? "strong",
      protectedTools: (compress.protectedTools as string[]) ?? [],
      protectTags: (compress.protectTags as boolean) ?? false,
      protectUserMessages: (compress.protectUserMessages as boolean) ?? false,
      ...(compress.modelMaxLimits !== undefined ? { modelMaxLimits: compress.modelMaxLimits } : {}),
      ...(compress.modelMinLimits !== undefined ? { modelMinLimits: compress.modelMinLimits } : {}),
    },
    turnProtection: {
      enabled: (turnProtection.enabled as boolean) ?? true,
      turns: (turnProtection.turns as number) ?? 2,
    },
    experimental: {
      allowSubAgents: (experimental.allowSubAgents as boolean) ?? true,
      customPrompts: false,
    },
    protectedFilePatterns: (merged.protectedFilePatterns as string[]) ?? [],
    commands: {
      enabled: (commands.enabled as boolean) ?? true,
      protectedTools: (commands.protectedTools as string[]) ?? [],
    },
    manualMode: {
      enabled: (manualMode.enabled as boolean) ?? false,
      automaticStrategies: (manualMode.automaticStrategies as boolean) ?? true,
    },
    strategies: {
      deduplication: {
        enabled: (deduplication.enabled as boolean) ?? true,
        protectedTools: (deduplication.protectedTools as string[]) ?? [],
      },
      purgeErrors: {
        enabled: (purgeErrors.enabled as boolean) ?? true,
        turns: (purgeErrors.turns as number) ?? 2,
        protectedTools: (purgeErrors.protectedTools as string[]) ?? [],
      },
    },
  }
}

/**
 * Switch the active DCP profile.
 * Reads profile parameters from the Matrixx plugin configuration and writes
 * a full inline DCP config to ~/.config/opencode/dcp.jsonc.
 */
export function switchProfile(profile: string, options?: DcpSwitchProfileOptions): string {
  // Validate profile — accept built-ins OR custom profiles defined in config
  const customProfiles = Object.keys(options?.pluginConfig?.dcp?.profiles ?? {})
  const allValid = [...VALID_PROFILES, ...customProfiles]
  if (!allValid.includes(profile)) {
    return `Error: Invalid profile "${profile}". Valid profiles: ${allValid.join(", ")}`
  }

  // Check DCP installation
  const dcpError = checkDcpInstalled()
  if (dcpError) return dcpError

  // Build the full inline config from Matrixx configuration
  const inlineConfig = buildInlineConfig(profile, options)

  // Read-compare-write guard: skip rewrite when content is identical
  const newContent = `${JSON.stringify(inlineConfig, null, 2)}\n`
  try {
    const existing = readFileSync(DCP_SYMLINK, "utf-8")
    if (existing === newContent) {
      return `✓ Switched to DCP profile: ${profile}\n\nRestart OpenCode session for changes to take effect.`
    }
  } catch {
    // Missing/unreadable target — fall through to write (first-install path)
  }
  writeFileSync(DCP_SYMLINK, newContent)

  return `\u2713 Switched to DCP profile: ${profile}\n\nRestart OpenCode session for changes to take effect.`
}
