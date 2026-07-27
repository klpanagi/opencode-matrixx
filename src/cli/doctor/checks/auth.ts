import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { CheckResult, DoctorCheck } from "../types"

const OPECODE_CONFIG_PATH = join(homedir(), ".config", "opencode", "opencode.json")

type ProviderStatus = { provider: string; configured: boolean; detail?: string }

function getProviderStatuses(): ProviderStatus[] {
  const results: ProviderStatus[] = [
    { provider: "Anthropic", configured: false },
    { provider: "OpenAI", configured: false },
    { provider: "Google", configured: false },
  ]

  if (!existsSync(OPECODE_CONFIG_PATH)) {
    return results.map((r) => ({ ...r, detail: "opencode.json not found" }))
  }

  let config: Record<string, unknown>
  try {
    config = JSON.parse(readFileSync(OPECODE_CONFIG_PATH, "utf-8"))
  } catch {
    return results.map((r) => ({ ...r, detail: "opencode.json parse error" }))
  }

  const configStr = JSON.stringify(config).toLowerCase()

  for (const r of results) {
    const providerLower = r.provider.toLowerCase()
    if (configStr.includes(providerLower)) {
      r.configured = true
      r.detail = "Provider found in opencode.json"
    } else {
      r.detail = "Provider not configured in opencode.json"
    }
  }

  // Check environment variables as fallback
  if (process.env.ANTHROPIC_API_KEY) {
    results[0].configured = true
    results[0].detail = "ANTHROPIC_API_KEY env var set"
  }
  if (process.env.OPENAI_API_KEY) {
    results[1].configured = true
    results[1].detail = "OPENAI_API_KEY env var set"
  }
  if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
    results[2].configured = true
    results[2].detail = "Google/Gemini API key env var set"
  }

  return results
}

export const authCheck: DoctorCheck = {
  name: "authentication",
  category: "authentication",
  check: (): CheckResult => {
    const providers = getProviderStatuses()
    const configured = providers.filter((p) => p.configured)
    const unconfigured = providers.filter((p) => !p.configured)

    if (configured.length === 0) {
      return {
        name: "authentication",
        status: "fail",
        message: "No API providers configured",
        detail: providers
          .map((p) => `  ${p.provider}: ${p.detail ?? "not configured"}`)
          .join("\n"),
      }
    }

    const configuredList = configured.map((p) => p.provider).join(", ")
    const warnings = unconfigured.map((p) => p.provider).join(", ")

    if (unconfigured.length > 0) {
      return {
        name: "authentication",
        status: "warn",
        message: `Configured: ${configuredList}. Missing: ${warnings}`,
        detail: `Missing providers:\n${unconfigured.map((p) => `  ${p.provider}: ${p.detail ?? "not configured"}`).join("\n")}`,
      }
    }

    return {
      name: "authentication",
      status: "pass",
      message: `All providers configured: ${configuredList}`,
    }
  },
}
