import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export interface InstallOptions {
  noTui?: boolean
  claude?: "yes" | "no" | "max20"
  openai?: "yes" | "no"
  gemini?: "yes" | "no"
  copilot?: "yes" | "no"
  opencodeZen?: "yes" | "no"
  zaiCodingPlan?: "yes" | "no"
  verbose?: boolean
}

function getOpenCodeConfigPath(): string {
  const configDir = join(homedir(), ".config", "opencode")
  const jsonPath = join(configDir, "opencode.json")
  const jsoncPath = join(configDir, "opencode.jsonc")

  if (existsSync(jsoncPath)) return jsoncPath
  return jsonPath
}

function hasExistingPluginRegistration(configPath: string): boolean {
  if (!existsSync(configPath)) return false
  try {
    const content = readFileSync(configPath, "utf-8")
    return content.includes("opencode-matrixx")
  } catch {
    return false
  }
}

function generatePluginEntry(absolutePath: string): string {
  // Try common install locations
  const possibleLocations = [
    absolutePath,
    join(absolutePath, "dist", "index.js"),
    join(homedir(), ".bun", "install", "global", "node_modules", "opencode-matrixx", "dist", "index.js"),
  ]

  for (const loc of possibleLocations) {
    if (existsSync(loc)) {
      return `file://${loc}`
    }
  }

  // Fallback: assume bunx-able
  return "opencode-matrixx"
}

export async function executeInstall(options: InstallOptions): Promise<string> {
  const configDir = join(homedir(), ".config", "opencode")
  const configPath = getOpenCodeConfigPath()

  // Ensure config directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  // Check if already registered
  if (hasExistingPluginRegistration(configPath)) {
    return `✓ Plugin already registered in ${configPath}`
  }

  // Generate plugin entry
  const cwd = process.cwd()
  const pluginEntry = generatePluginEntry(cwd)

  // Create or update opencode.json
  let config: { plugin?: string[] }
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8")
      config = JSON.parse(content)
    } catch {
      config = {}
    }
  } else {
    config = {}
  }

  if (!config.plugin) {
    config.plugin = []
  }
  config.plugin.push(pluginEntry)

  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)

  // Build subscription flags info
  const flags: string[] = []
  if (options.claude) flags.push(`Claude: ${options.claude}`)
  if (options.openai) flags.push(`OpenAI: ${options.openai}`)
  if (options.gemini) flags.push(`Gemini: ${options.gemini}`)
  if (options.copilot) flags.push(`Copilot: ${options.copilot}`)
  if (options.opencodeZen) flags.push(`OpenCode Zen: ${options.opencodeZen}`)
  if (options.zaiCodingPlan) flags.push(`Z.ai: ${options.zaiCodingPlan}`)

  const parts: string[] = [
    "",
    "┌──────────────────────────────────────┐",
    "│  Matrixx Install Complete            │",
    "└──────────────────────────────────────┘",
    "",
    `✓ Plugin registered in ${configPath}`,
    `  Entry: ${pluginEntry}`,
    "",
  ]

  if (flags.length > 0) {
    parts.push("  Subscriptions:")
    for (const f of flags) {
      parts.push(`    ${f}`)
    }
    parts.push("")
  }

  parts.push("  Next steps:")
  parts.push("    1. Configure authentication via `opencode auth login`")
  parts.push("    2. Verify with `bunx opencode-matrixx doctor`")
  parts.push("")

  return parts.join("\n")
}
