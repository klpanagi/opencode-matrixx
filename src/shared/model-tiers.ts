/**
 * Tier registry — abstract model classifications resolved against the live provider list.
 *
 * Tiers are matched by regex against "provider/model" strings, with a `providerPriority`
 * list to choose between providers when multiple match. A `staticFallback` is used at
 * first run when the live provider list is not yet available.
 *
 * Adding a new model does NOT require code changes — the regex patterns intentionally
 * match model families (e.g. `claude-opus`) so a new opus-4-7 model is picked up
 * automatically.
 */

export type TierName = "free" | "fast" | "standard" | "premium" | "frontier"

export interface TierSpec {
  name: TierName
  /** Provider priority — first provider with a matching model wins. */
  providerPriority: string[]
  /** Regex tested against each "provider/model" string in the live provider list. */
  modelPattern: RegExp
  /** Tier to recurse into if this tier cannot be satisfied. */
  fallbackTier?: TierName
  /** Static fallbacks used at first run when the live provider list is empty
   *  but the connected providers cache already lists which providers are reachable. */
  staticFallback: { providers: string[]; model: string; variant?: string }[]
}

export const TIER_SPECS: Record<TierName, TierSpec> = {
  free: {
    name: "free",
    providerPriority: ["opencode", "xai", "opencode-go", "zai-coding-plan"],
    modelPattern: /-free$|kimi-k2\.5-free|minimax-m2\.5-free|grok-code-fast/,
    staticFallback: [
      { providers: ["opencode"], model: "kimi-k2.5-free" },
      { providers: ["xai"], model: "grok-code-fast-1" },
    ],
  },
  fast: {
    name: "fast",
    providerPriority: ["anthropic", "openai", "google", "opencode-go"],
    modelPattern: /claude-haiku|gpt-5-nano|gemini-2\.5-flash|deepseek-v4-flash/,
    staticFallback: [{ providers: ["anthropic"], model: "claude-haiku-4-5" }],
    fallbackTier: "free",
  },
  standard: {
    name: "standard",
    providerPriority: ["anthropic", "openai", "google", "opencode-go"],
    modelPattern: /claude-sonnet|gpt-5\.2|gemini-2\.5-pro/,
    staticFallback: [{ providers: ["anthropic"], model: "claude-sonnet-4-6" }],
    fallbackTier: "fast",
  },
  premium: {
    name: "premium",
    providerPriority: ["anthropic", "openai", "google", "opencode-go"],
    modelPattern: /claude-opus|gpt-5\.3-codex|gemini-3-pro/,
    staticFallback: [{ providers: ["anthropic"], model: "claude-opus-4-6" }],
    fallbackTier: "standard",
  },
  frontier: {
    name: "frontier",
    providerPriority: ["anthropic", "openai", "google", "opencode-go"],
    modelPattern: /claude-opus|gpt-5\.3-codex|gemini-3\.1-pro/,
    staticFallback: [{ providers: ["anthropic"], model: "claude-opus-4-6" }],
    fallbackTier: "premium",
  },
}

export const TIER_NAMES = Object.keys(TIER_SPECS) as TierName[]

const TIER_REFERENCE_RE = /^tier:(\w+)$/i

export function parseTierReference(value: string | undefined | null): TierName | null {
  if (!value) return null
  const m = TIER_REFERENCE_RE.exec(value.trim())
  if (!m) return null
  const name = m[1].toLowerCase() as TierName
  return name in TIER_SPECS ? name : null
}
