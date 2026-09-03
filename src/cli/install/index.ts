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
  local?: boolean
}

function getOpenCodeConfigPath(): string {
  const configDir = join(homedir(), ".config", "opencode")
  const jsonPath = join(configDir, "opencode.json")
  const jsoncPath = join(configDir, "opencode.jsonc")
  if (existsSync(jsoncPath)) return jsoncPath
  return jsonPath
}

function stripJsonComments(text: string): string {
  return text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
}

function parseOpenCodeConfig(content: string): { plugin?: string[] } {
  try {
    const stripped = stripJsonComments(content)
    return JSON.parse(stripped)
  } catch {
    return {}
  }
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

function isLocalRepoCheckout(dir: string): boolean {
  return existsSync(join(dir, "src", "index.ts")) && existsSync(join(dir, "package.json"))
}

function generatePluginEntry(absolutePath: string, forceLocal?: boolean): string {
  const looksLocal = forceLocal || isLocalRepoCheckout(absolutePath)
  if (looksLocal) {
    const distEntry = join(absolutePath, "dist", "index.js")
    if (existsSync(distEntry)) return `file://${distEntry}`
    if (existsSync(absolutePath)) return `file://${absolutePath}`
  }
  return "opencode-matrixx"
}

export async function executeInstall(options: InstallOptions): Promise<string> {
  const configDir = join(homedir(), ".config", "opencode")
  const configPath = getOpenCodeConfigPath()

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  if (hasExistingPluginRegistration(configPath)) {
    return `✓ Plugin already registered in ${configPath}`
  }

  const cwd = process.cwd()
  const pluginEntry = generatePluginEntry(cwd, options.local)

  let config: { plugin?: string[] }
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8")
      config = parseOpenCodeConfig(content)
    } catch {
      config = {}
    }
  } else {
    config = {}
  }

  if (!config.plugin) {
    config.plugin = []
  }
  if (!config.plugin.includes(pluginEntry)) {
    config.plugin.push(pluginEntry)
  }

  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)

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
  if (pluginEntry === "opencode-matrixx") {
    parts.push("    3. Restart OpenCode to load the plugin")
  } else {
    parts.push("    3. Run `bun run build` in the repo, then restart OpenCode")
  }
  parts.push("")

  return parts.join("\n")
}
