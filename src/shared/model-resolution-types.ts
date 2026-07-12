import type { FallbackEntry } from "./model-requirements"

export type ModelResolutionRequest = {
  intent?: {
    /** Global override for all agents and categories — set via the global_model config.
     * Highest priority; checked before everything else. */
    globalOverrideModel?: string
    uiSelectedModel?: string
    userModel?: string
    categoryDefaultModel?: string
    }
  constraints: {
    availableModels: Set<string>
    connectedProviders?: string[]
  }
  policy?: {
    fallbackChain?: FallbackEntry[]
    systemDefaultModel?: string
  }
}

export type ModelResolutionProvenance =
  | "override"
  | "category-default"
  | "provider-fallback"
  | "system-default"

export type ModelResolutionResult = {
  model: string
  provenance: ModelResolutionProvenance
  variant?: string
  attempted?: string[]
  reason?: string
}
