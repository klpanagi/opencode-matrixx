import { resolveModelPipeline } from "../../shared"

export function applyModelResolution(input: {
  globalOverrideModel?: string
  uiSelectedModel?: string
  userModel?: string
  requirement?: { fallbackChain?: { providers: string[]; model: string; variant?: string }[] }
  availableModels: Set<string>
  systemDefaultModel?: string
}) {
  const { globalOverrideModel, uiSelectedModel, userModel, requirement, availableModels, systemDefaultModel } = input
  return resolveModelPipeline({
    intent: { globalOverrideModel, uiSelectedModel, userModel },
    constraints: { availableModels },
    policy: { fallbackChain: requirement?.fallbackChain, systemDefaultModel },
  })
}

export function getFirstFallbackModel(requirement?: {
  fallbackChain?: { providers: string[]; model: string; variant?: string }[]
}) {
  const entry = requirement?.fallbackChain?.[0]
  if (!entry || entry.providers.length === 0) return undefined
  return {
    model: `${entry.providers[0]}/${entry.model}`,
    provenance: "provider-fallback" as const,
    variant: entry.variant,
  }
}
