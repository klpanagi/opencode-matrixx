import type { ProviderModel } from "./types"

export const DEFAULT_VOTERS = 3
export const DEFAULT_ROUNDS = 2
export const VOTER_TIMEOUT_MS = 120_000
export const POLL_INTERVAL_MS = 1_000

export const DEFAULT_PROVIDERS: ProviderModel[] = [
  { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
  { providerID: "openai", modelID: "gpt-4o" },
  { providerID: "google", modelID: "gemini-2.5-pro" },
]
