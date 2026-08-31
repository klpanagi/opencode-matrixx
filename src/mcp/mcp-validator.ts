import type { WebsearchConfig } from "../config/schema"

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

export function isCommandAvailable(command: string): boolean {
  try {
    const result = Bun.spawnSync([command, "--version"], { stdout: "pipe", stderr: "pipe" })
    return result.exitCode === 0
  } catch {
    return false
  }
}
