import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { CheckResult, DoctorCheck } from "../types"

const OPENCODE_CONFIG_PATHS = [
  join(homedir(), ".config", "opencode", "opencode.json"),
  join(homedir(), ".config", "opencode", "opencode.jsonc"),
]

const AUTH_JSON_PATHS = [
  join(homedir(), ".local", "share", "opencode", "auth.json"),
  join(homedir(), ".config", "opencode", "auth.json"),
]

type ProviderStatus = { provider: string; configured: boolean; detail?: string }

function stripJsonComments(text: string): string {
  return text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
}

function collectConfigText(): string {
  let combined = ""
  for (const p of OPENCODE_CONFIG_PATHS) {
    if (!existsSync(p)) continue
    try {
      const raw = readFileSync(p, "utf-8")
      combined += ` ${stripJsonComments(raw)}`
    } catch {}
  }
  return combined.toLowerCase()
}

function collectAuthText(): string {
  let combined = ""
  for (const p of AUTH_JSON_PATHS) {
    if (!existsSync(p)) continue
    try {
      const raw = readFileSync(p, "utf-8")
      combined += ` ${raw}`
    } catch {}
  }
  try {
    const result = Bun.spawnSync(["opencode", "auth", "list", "--json"], { stdout: "pipe", stderr: "pipe" })
    if (result.exitCode === 0) combined += ` ${result.stdout.toString()}`
  } catch {}
  return combined.toLowerCase()
}

function hasProvider(haystack: string, keywords: string[]): boolean {
  return keywords.some((k) => haystack.includes(k))
}

function getProviderStatuses(): ProviderStatus[] {
  const results: ProviderStatus[] = [
    { provider: "Anthropic", configured: false },
    { provider: "OpenAI", configured: false },
    { provider: "Google", configured: false },
  ]

  const configText = collectConfigText()
  const authText = collectAuthText()
  const combinedAuthConfig = `${configText} ${authText}`
  const hasAnyConfigFile = OPENCODE_CONFIG_PATHS.some(existsSync) || AUTH_JSON_PATHS.some(existsSync)

  if (!hasAnyConfigFile && !combinedAuthConfig.trim()) {
    if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
    } else {
      return results.map((r) => ({ ...r, detail: "No opencode config or auth storage found — run `opencode auth login`" }))
    }
  }

  const providerChecks: Record<string, string[]> = {
    Anthropic: ["anthropic", "claude"],
    OpenAI: ["openai"],
    Google: ["google", "gemini", "vertex"],
  }

  for (const r of results) {
    const keywords = providerChecks[r.provider] ?? [r.provider.toLowerCase()]
    const inConfig = hasProvider(configText, keywords)
    const inAuth = hasProvider(authText, keywords)
    if (inConfig || inAuth) {
      r.configured = true
      r.detail = inAuth ? "Provider found in auth storage" : "Provider found in opencode config"
    } else {
      r.detail = "Provider not configured — run `opencode auth login` or set env var"
    }
  }

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
        detail: providers.map((p) => `  ${p.provider}: ${p.detail ?? "not configured"}`).join("\n"),
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
