import type { ConsensusConfig } from "../../config/schema/consensus"
import { DEFAULT_PROVIDERS } from "./constants"
import type { ProviderModel } from "./types"

export function selectProviders(
  count: number,
  modelsOverride: string[] | undefined,
  config: ConsensusConfig | undefined,
): ProviderModel[] {
  if (modelsOverride && modelsOverride.length > 0) {
    return modelsOverride.slice(0, count).map((m) => {
      const parts = m.split(":")
      if (parts.length >= 2) {
        return { providerID: parts[0], modelID: parts.slice(1).join(":") }
      }
      return { providerID: "custom", modelID: m }
    })
  }

  const configuredProviders = config?.providers ?? DEFAULT_PROVIDERS

  if (configuredProviders.length === 0) {
    return DEFAULT_PROVIDERS.slice(0, count)
  }

  if (configuredProviders.length <= count) {
    return configuredProviders
  }

  const selected: ProviderModel[] = []
  const usedProviderIds = new Set<string>()

  for (const p of configuredProviders) {
    if (selected.length >= count) break
    if (!usedProviderIds.has(p.providerID)) {
      selected.push(p)
      usedProviderIds.add(p.providerID)
    }
  }

  if (selected.length < count) {
    for (const p of configuredProviders) {
      if (selected.length >= count) break
      if (!selected.includes(p)) {
        selected.push(p)
      }
    }
  }

  return selected
}
