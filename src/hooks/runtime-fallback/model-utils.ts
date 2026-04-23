export function parseModelString(model: string): { providerID: string; modelID: string; variant?: string } | undefined {
  const variantMatch = model.match(/^(.+)\(([^)]+)\)$/)
  if (variantMatch) {
    const base = variantMatch[1]
    const variant = variantMatch[2]
    const parts = base.split("/")
    if (parts.length >= 2) {
      return { providerID: parts[0], modelID: parts.slice(1).join("/"), variant }
    }
    return undefined
  }

  const parts = model.split("/")
  if (parts.length >= 2) {
    return { providerID: parts[0], modelID: parts.slice(1).join("/") }
  }
  return undefined
}

export function normalizeFallbackModels(models: string | string[] | undefined): string[] | undefined {
  if (!models) return undefined
  if (typeof models === "string") return [models]
  return models
}

export function flattenToFallbackModelStrings(models: string[] | undefined): string[] | undefined {
  return models
}
