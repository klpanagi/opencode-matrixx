import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { CheckResult, DoctorCheck } from "../types"

const OPECODE_CONFIG_PATHS = [
  join(homedir(), ".config", "opencode", "opencode.json"),
  join(homedir(), ".config", "opencode", "opencode.jsonc"),
]

function findOpenCodeConfig(): string | null {
  for (const p of OPECODE_CONFIG_PATHS) {
    if (existsSync(p)) return p
  }
  return null
}

function checkOpenCodeVersion(): string | null {
  try {
    const result = Bun.spawnSync(["opencode", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    })
    if (result.exitCode === 0) {
      return result.stdout.toString().trim()
    }
  } catch {
    // Not installed
  }
  return null
}

export const pluginInstallationCheck: DoctorCheck = {
  name: "plugin-installation",
  category: "installation",
  check: (): CheckResult => {
    const version = checkOpenCodeVersion()
    if (!version) {
      return {
        name: "plugin-installation",
        status: "fail",
        message: "OpenCode CLI not found in PATH",
        detail: "Install OpenCode first: https://opencode.ai/docs",
      }
    }

    const semverMatch = version.match(/(\d+)\.(\d+)\.(\d+)/)
    if (!semverMatch) {
      return {
        name: "plugin-installation",
        status: "warn",
        message: `OpenCode version: ${version} (unable to parse)`,
      }
    }

    const major = Number(semverMatch[1])
    const minor = Number(semverMatch[2])
    const meetsMinVersion = major >= 1 && minor >= 0

    const configPath = findOpenCodeConfig()
    if (!configPath) {
      return {
        name: "plugin-installation",
        status: "warn",
        message: `OpenCode ${version} installed, but opencode.json not found`,
        detail: "Run `opencode` once to generate the config file",
      }
    }

    let configContent: string
    try {
      configContent = readFileSync(configPath, "utf-8")
    } catch {
      return {
        name: "plugin-installation",
        status: "fail",
        message: `Cannot read config: ${configPath}`,
      }
    }

    const hasPlugin =
      configContent.includes("opencode-matrixx") ||
      configContent.includes("@klpanagi/opencode-matrixx")

    if (!meetsMinVersion) {
      return {
        name: "plugin-installation",
        status: "fail",
        message: `OpenCode ${version} is below minimum 1.0.150`,
        detail: "Update OpenCode to use Matrixx plugin",
      }
    }

    if (!hasPlugin) {
      return {
        name: "plugin-installation",
        status: "warn",
        message: `OpenCode ${version} installed, plugin not registered in ${configPath}`,
        detail: "Run `bunx opencode-matrixx install` to register the plugin",
      }
    }

    return {
      name: "plugin-installation",
      status: "pass",
      message: `OpenCode ${version}, plugin registered in ${configPath}`,
    }
  },
}
