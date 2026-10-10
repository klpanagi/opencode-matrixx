import type { WebsearchConfig } from "../config/schema"
import type { ScholarConfig } from "../config/schema/scholar"

export interface McpCreationFailure {
  name: string
  error: string
}

export type McpValidationResult = { ok: true } | { ok: false; error: string }

export function validateWebsearchConfig(config?: WebsearchConfig): McpValidationResult {
  const provider = config?.provider || "exa"
  if (provider === "tavily" && !process.env.TAVILY_API_KEY) {
    return {
      ok: false,
      error: "TAVILY_API_KEY environment variable is required for Tavily provider",
    }
  }
  return { ok: true }
}

// Redaction rule: errors never echo key material — field names and shapes only.
export function validateScholarConfig(config?: ScholarConfig): McpValidationResult {
  if (!config) return { ok: true }
  if (config.s2ApiKey !== undefined && config.s2ApiKey.length === 0) {
    return { ok: false, error: "scholar.s2ApiKey must be a non-empty string when set" }
  }
  if (config.mailto !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(config.mailto)) {
    return { ok: false, error: "scholar.mailto must be a valid email address when set" }
  }
  return { ok: true }
}

export function isCommandAvailable(command: string): boolean {
  try {
    const result = Bun.spawnSync([command, "--version"], { stdout: "pipe", stderr: "pipe" })
    return result.exitCode === 0
  } catch {
    return false
  }
}
