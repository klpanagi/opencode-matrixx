import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseJsoncSafe } from "../../../shared/jsonc-parser"
import { getOpenCodeConfigPaths } from "../../../shared/opencode-config-dir"
import { compareVersions } from "../../../shared/opencode-version"
import type { CheckResult, DoctorCheck } from "../types"

function checkOpenCodeVersion(): string | null {
  try {
    const result = Bun.spawnSync(["opencode", "--version"], { stdout: "pipe", stderr: "pipe" })
    if (result.exitCode === 0) return result.stdout.toString().trim()
  } catch { void 0 }
  return null
}

function extractVersion(raw: string): string | null {
  const m = raw.match(/(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/)
  return m?.[1] ?? null
}

function parsePluginEntries(content: string): string[] | null {
  const parsed = parseJsoncSafe<Record<string, unknown>>(content)
  if (!parsed.data || parsed.errors.length > 0) return null
  const raw = (parsed.data as { plugin?: unknown }).plugin
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is string => typeof v === "string")
}

function isMatrixxPlugin(entry: string): boolean {
  const lower = entry.toLowerCase()
  if (lower === "opencode-matrixx") return true
  if (lower.startsWith("opencode-matrixx@")) return true
  if (lower === "@klpanagi/opencode-matrixx") return true
  if (lower.startsWith("@klpanagi/opencode-matrixx@")) return true
  if (lower.startsWith("file://") && lower.includes("matrixx")) return true
  return false
}

function validateFilePlugin(entry: string): string | null {
  if (!entry.toLowerCase().startsWith("file://")) return null
  const filePath = entry.slice(7)
  if (!existsSync(filePath)) return `file:// target not found: ${filePath} → fix: reinstall or correct path`
  const distIndex = join(filePath, "dist", "index.js")
  const altIndex = join(filePath, "index.js")
  if (!existsSync(distIndex) && !existsSync(altIndex)) return `file:// target missing dist/index.js: ${filePath} → fix: run bun run build in plugin dir`
  return null
}

export const pluginInstallationCheck: DoctorCheck = {
  name: "plugin-installation",
  category: "installation",
  check: (): CheckResult => {
    const rawVersion = checkOpenCodeVersion()
    if (!rawVersion) {
      return { name: "plugin-installation", status: "fail", message: "OpenCode CLI not found in PATH", detail: "→ fix: Install OpenCode https://opencode.ai/docs" }
    }
    const version = extractVersion(rawVersion)
    if (!version) {
      return { name: "plugin-installation", status: "warn", message: `OpenCode version: ${rawVersion} (unable to parse)`, detail: "→ fix: ensure opencode --version returns semver" }
    }
    if (compareVersions(version, "1.0.150") < 0) {
      return { name: "plugin-installation", status: "fail", message: `OpenCode ${version} is below minimum 1.0.150`, detail: "→ fix: Update OpenCode to use Matrixx plugin" }
    }
    const paths = getOpenCodeConfigPaths({ binary: "opencode" })
    let configPath: string | null = null
    let configContent: string | null = null
    for (const p of [paths.configJsonc, paths.configJson]) {
      if (existsSync(p)) {
        configPath = p
        try { configContent = readFileSync(p, "utf-8") } catch { return { name: "plugin-installation", status: "fail", message: `Cannot read config: ${p}`, detail: "→ fix: check file permissions" } }
        break
      }
    }
    if (!configPath || configContent === null) {
      return { name: "plugin-installation", status: "warn", message: `OpenCode ${version} installed, but opencode.json not found`, detail: `→ fix: Run opencode once to generate config at ${paths.configDir}` }
    }
    const plugins = parsePluginEntries(configContent)
    if (plugins === null) {
      return { name: "plugin-installation", status: "fail", message: `Invalid JSONC in ${configPath}`, detail: "→ fix: validate JSONC syntax at reported offset" }
    }
    const hasLegacy = plugins.some((e) => e.toLowerCase() === "matrixx")
    const matrixxEntries = plugins.filter(isMatrixxPlugin)
    const fileErrors = matrixxEntries.map(validateFilePlugin).filter((v): v is string => v !== null)
    if (fileErrors.length > 0) {
      return { name: "plugin-installation", status: "warn", message: `OpenCode ${version}, plugin file:// target issue`, detail: fileErrors.join("\n") }
    }
    if (hasLegacy && matrixxEntries.length === 0) {
      return { name: "plugin-installation", status: "warn", message: `OpenCode ${version}, legacy "matrixx" entry found`, detail: `→ fix: Replace "matrixx" with "opencode-matrixx" in ${configPath}` }
    }
    if (hasLegacy && matrixxEntries.length > 0) {
      return { name: "plugin-installation", status: "warn", message: `OpenCode ${version}, plugin registered but legacy "matrixx" entry present`, detail: `→ fix: Remove legacy "matrixx" from ${configPath}` }
    }
    if (matrixxEntries.length === 0) {
      return { name: "plugin-installation", status: "warn", message: `OpenCode ${version} installed, plugin not registered in ${configPath}`, detail: "→ fix: Run bunx opencode-matrixx install to register the plugin" }
    }
    return { name: "plugin-installation", status: "pass", message: `OpenCode ${version}, plugin registered in ${configPath}` }
  },
}
