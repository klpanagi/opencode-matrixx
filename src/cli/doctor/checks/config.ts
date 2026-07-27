import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { CheckResult, DoctorCheck } from "../types"

const MATRIX_CONFIG_PATHS = [
  join(process.cwd(), "matrixx.json"),
  join(process.cwd(), "matrixx.jsonc"),
  join(process.cwd(), ".opencode", "matrixx.json"),
  join(homedir(), ".config", "opencode", "matrixx.json"),
  join(homedir(), ".config", "opencode", "matrixx.jsonc"),
]

function findMatrixxConfig(): { path: string; content: string } | null {
  for (const p of MATRIX_CONFIG_PATHS) {
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, "utf-8")
        return { path: p, content }
      } catch {
        return null
      }
    }
  }
  return null
}

function tryParseJSON(text: string): { valid: boolean; error?: string } {
  try {
    JSON.parse(text)
    return { valid: true }
  } catch (err) {
    return { valid: false, error: String(err) }
  }
}

export const configValidationCheck: DoctorCheck = {
  name: "config-validation",
  category: "configuration",
  check: (): CheckResult => {
    const found = findMatrixxConfig()
    if (!found) {
      return {
        name: "config-validation",
        status: "warn",
        message: "No matrixx configuration file found",
        detail: "Create matrixx.jsonc in your project or ~/.config/opencode/",
      }
    }

    // Try strict JSON parse first
    const parseResult = tryParseJSON(found.content)

    if (!parseResult.valid) {
      // Might be JSONC — accept with warning
      const hasJsoncSigns =
        found.content.includes("//") || found.content.includes("/*") || found.content.includes(",,")

      if (hasJsoncSigns) {
        return {
          name: "config-validation",
          status: "warn",
          message: `Config file has comments/trailing commas (JSONC), may need JSONC parser`,
          detail: `Path: ${found.path}`,
        }
      }

      return {
        name: "config-validation",
        status: "fail",
        message: `Invalid JSON in config: ${parseResult.error}`,
        detail: `Path: ${found.path}`,
      }
    }

    return {
      name: "config-validation",
      status: "pass",
      message: `Configuration file is valid at ${found.path}`,
    }
  },
}
