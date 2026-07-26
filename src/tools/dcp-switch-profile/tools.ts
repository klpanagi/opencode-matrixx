import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"

const DCP_DIR = join(homedir(), ".myopencode", "dcp")
const DCP_PLUGIN_DIR = join(homedir(), ".config", "opencode", "node_modules", "@tarquinen", "opencode-dcp")
const DCP_SYMLINK = join(homedir(), ".config", "opencode", "dcp.jsonc")

const VALID_PROFILES = ["economy", "balanced", "performance", "ultimate"] as const

/**
 * Strip JSONC comments (single-line // and multi-line /* * /) from a string,
 * preserving string literals that may contain comment-like sequences.
 */
function stripJsoncComments(raw: string): string {
  let result = ""
  let i = 0
  while (i < raw.length) {
    if (raw[i] === '"') {
      // String literal — copy until closing quote (handle escapes)
      result += raw[i++]
      while (i < raw.length && raw[i] !== '"') {
        if (raw[i] === "\\") result += raw[i++]
        if (i < raw.length) result += raw[i++]
      }
      if (i < raw.length) result += raw[i++]
    } else if (raw[i] === "/" && raw[i + 1] === "/") {
      // Single-line comment — skip until newline
      while (i < raw.length && raw[i] !== "\n") i++
    } else if (raw[i] === "/" && raw[i + 1] === "*") {
      // Multi-line comment — skip until */
      i += 2
      while (i < raw.length - 1 && !(raw[i] === "*" && raw[i + 1] === "/")) i++
      i += 2
    } else {
      result += raw[i++]
    }
  }
  return result
}

/**
 * Deep-merge two objects. Arrays and primitives from `source` replace those in `target`.
 * Nested objects are merged recursively.
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge((result[key] as Record<string, unknown>) || {}, source[key] as Record<string, unknown>)
    } else {
      result[key] = source[key]
    }
  }
  return result
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
 * Read and parse a JSONC config file.
 */
function readJsoncConfig(filePath: string): Record<string, unknown> {
  const raw = readFileSync(filePath, "utf8")
  const cleaned = stripJsoncComments(raw)
  return JSON.parse(cleaned) as Record<string, unknown>
}

/**
 * Switch the active DCP profile.
 * Reads base + profile JSONC configs, deep-merges them, writes the generated config,
 * and updates the symlink.
 */
function switchProfile(profile: string): string {
  // Validate profile
  if (!VALID_PROFILES.includes(profile as typeof VALID_PROFILES[number])) {
    return `Error: Invalid profile "${profile}". Valid profiles: ${VALID_PROFILES.join(", ")}`
  }

  // Check DCP installation
  const dcpError = checkDcpInstalled()
  if (dcpError) return dcpError

  // Resolve file paths
  const basePath = join(DCP_DIR, "dcp-base.jsonc")
  const overridePath = join(DCP_DIR, `dcp-${profile}.jsonc`)
  const outputPath = join(DCP_DIR, `dcp-generated-${profile}.jsonc`)

  // Verify config files exist
  if (!existsSync(basePath)) {
    return `Error: Base DCP config not found at ${basePath}`
  }
  if (!existsSync(overridePath)) {
    return `Error: Profile config not found at ${overridePath}`
  }

  // Read and merge configs
  let base: Record<string, unknown>
  let override: Record<string, unknown>
  try {
    base = readJsoncConfig(basePath)
    override = readJsoncConfig(overridePath)
  } catch (err) {
    return `Error: Failed to parse config files: ${err instanceof Error ? err.message : String(err)}`
  }

  const merged = deepMerge(base, override)

  // Ensure output directory exists
  mkdirSync(DCP_DIR, { recursive: true })

  // Write generated config
  writeFileSync(outputPath, JSON.stringify(merged, null, 2) + "\n")

  // Update symlink — remove existing then recreate
  try {
    if (existsSync(DCP_SYMLINK)) {
      unlinkSync(DCP_SYMLINK)
    }
  } catch {
    // Ignore if symlink doesn't exist or can't be removed
  }

  try {
    // Use relative symlink for portability
    const relPath = join("..", ".myopencode", "dcp", `dcp-generated-${profile}.jsonc`)
    writeFileSync(DCP_SYMLINK, `{"$schema": "https://raw.githubusercontent.com/Opencode-DCP/opencode-dynamic-context-pruning/v3.1.14/dcp.schema.json","extend": "${relPath}"}`)
  } catch (err) {
    return `Error: Failed to update symlink: ${err instanceof Error ? err.message : String(err)}`
  }

  return `Generated: ${outputPath}\n✓ Switched to DCP profile: ${profile}\n\nRestart OpenCode session for changes to take effect.`
}

export function createDcpSwitchProfileTool(): Record<string, ToolDefinition> {
  const dcp_switch_profile: ToolDefinition = tool({
    description:
      "Switch the active DCP (Dynamic Context Pruning) profile tier. " +
      "Reads the base DCP config and profile-specific overrides from ~/.myopencode/dcp/, " +
      "deep-merges them (base first, then profile overrides), writes the generated config, " +
      "and updates the symlink at ~/.config/opencode/dcp.jsonc. " +
      "Call this with one of: economy, balanced, performance, ultimate.",
    args: {
      profile: tool.schema
        .enum(VALID_PROFILES)
        .describe("Target DCP profile tier: economy (most aggressive), balanced, performance, ultimate (least aggressive)"),
    },
    async execute(args) {
      const profile = args.profile as string
      return switchProfile(profile)
    },
  })

  return { dcp_switch_profile }
}
