import { beforeAll, describe, expect, it } from "bun:test"

let resolveTier: typeof import("./tier-resolver").resolveTier
let parseTierReference: typeof import("./tier-resolver").parseTierReference
let TIER_SPECS: typeof import("./model-tiers").TIER_SPECS
let TIER_NAMES: typeof import("./model-tiers").TIER_NAMES

beforeAll(async () => {
  ;({ resolveTier, parseTierReference } = await import("./tier-resolver"))
  ;({ TIER_SPECS, TIER_NAMES } = await import("./model-tiers"))
})

describe("resolveTier", () => {
  describe("free tier", () => {
    it("#given available models with kimi-free #when resolveTier('free') #then picks opencode/kimi-k2.5-free", () => {
      //#given
      const available = new Set([
        "opencode/kimi-k2.5-free",
        "anthropic/claude-opus-4-6",
        "openai/gpt-5.2",
      ])

      //#when
      const result = resolveTier("free", { availableModels: available, connectedProviders: null })

      //#then
      expect(result?.model).toBe("opencode/kimi-k2.5-free")
      expect(result?.provenance).toBe("tier-resolved")
      expect(result?.tier).toBe("free")
    })

    it("#given no live models but opencode is connected #when resolveTier('free') #then uses static fallback", () => {
      //#given
      const available = new Set<string>()

      //#when
      const result = resolveTier("free", {
        availableModels: available,
        connectedProviders: ["opencode"],
      })

      //#then
      expect(result?.model).toBe("opencode/kimi-k2.5-free")
      expect(result?.provenance).toBe("tier-static-fallback")
    })

    it("#given no live models and no connected providers #when resolveTier('free') #then returns null (no staticFallback match)", () => {
      //#given
      const available = new Set<string>()

      //#when
      const result = resolveTier("free", {
        availableModels: available,
        connectedProviders: [],
      })

      //#then - no static fallback provider is connected
      expect(result).toBeNull()
    })
  })

  describe("premium tier", () => {
    it("#given anthropic + openai connected with claude-opus #when resolveTier('premium') #then picks anthropic/claude-opus-4-6 (provider priority)", () => {
      //#given
      const available = new Set([
        "anthropic/claude-opus-4-6",
        "openai/gpt-5.3-codex",
        "openai/gpt-5.2",
      ])

      //#when
      const result = resolveTier("premium", {
        availableModels: available,
        connectedProviders: ["anthropic", "openai"],
      })

      //#then
      expect(result?.model).toBe("anthropic/claude-opus-4-6")
      expect(result?.provenance).toBe("tier-resolved")
    })

    it("#given only openai connected #when resolveTier('premium') #then picks openai/gpt-5.3-codex (cross-provider)", () => {
      //#given
      const available = new Set(["openai/gpt-5.3-codex", "openai/gpt-5.2"])

      //#when
      const result = resolveTier("premium", {
        availableModels: available,
        connectedProviders: ["openai"],
      })

      //#then
      expect(result?.model).toBe("openai/gpt-5.3-codex")
    })

    it("#given only sonnet is available (no opus) #when resolveTier('premium') #then recurses to 'standard' tier", () => {
      //#given
      const available = new Set([
        "anthropic/claude-sonnet-4-6",
        "openai/gpt-5.2",
      ])

      //#when
      const result = resolveTier("premium", {
        availableModels: available,
        connectedProviders: ["anthropic", "openai"],
      })

      //#then - falls through to standard tier (premium.fallbackTier === "standard")
      expect(result?.model).toBe("anthropic/claude-sonnet-4-6")
      expect(result?.tier).toBe("standard")
    })

    it("#given newer claude-opus-4-7 model #when resolveTier('premium') #then regex matches automatically (no code change needed)", () => {
      //#given - simulating a future OpenCode lineup
      const available = new Set(["anthropic/claude-opus-4-7"])

      //#when
      const result = resolveTier("premium", {
        availableModels: available,
        connectedProviders: ["anthropic"],
      })

      //#then
      expect(result?.model).toBe("anthropic/claude-opus-4-7")
    })
  })

  describe("frontier tier", () => {
    it("#given anthropic opus + gpt-5.3-codex #when resolveTier('frontier') #then picks claude-opus (provider priority)", () => {
      //#given
      const available = new Set([
        "anthropic/claude-opus-4-6",
        "openai/gpt-5.3-codex",
      ])

      //#when
      const result = resolveTier("frontier", {
        availableModels: available,
        connectedProviders: ["anthropic", "openai"],
      })

      //#then
      expect(result?.model).toBe("anthropic/claude-opus-4-6")
    })
  })

  describe("fast tier", () => {
    it("#given haiku + gpt-5-nano #when resolveTier('fast') #then picks haiku (provider priority)", () => {
      //#given
      const available = new Set([
        "anthropic/claude-haiku-4-5",
        "openai/gpt-5-nano",
      ])

      //#when
      const result = resolveTier("fast", {
        availableModels: available,
        connectedProviders: ["anthropic", "openai"],
      })

      //#then
      expect(result?.model).toBe("anthropic/claude-haiku-4-5")
    })
  })

  describe("invalid tier", () => {
    it("#given an unknown tier name #when resolveTier #then returns null", () => {
      //#given
      const available = new Set(["anthropic/claude-opus-4-6"])

      //#when
      //#ts-expect-error testing invalid input
      const result = resolveTier("nonexistent" as never, {
        availableModels: available,
        connectedProviders: ["anthropic"],
      })

      //#then
      expect(result).toBeNull()
    })
  })
})

describe("parseTierReference", () => {
  it("#given 'tier:premium' #when parsed #then returns 'premium'", () => {
    //#given / #when
    const result = parseTierReference("tier:premium")

    //#then
    expect(result).toBe("premium")
  })

  it("#given 'tier:STANDARD' (uppercase) #when parsed #then returns 'standard' (lowercased)", () => {
    //#given / #when
    const result = parseTierReference("tier:STANDARD")

    //#then
    expect(result).toBe("standard")
  })

  it("#given a plain model string #when parsed #then returns null", () => {
    //#given / #when
    const result = parseTierReference("anthropic/claude-opus-4-6")

    //#then
    expect(result).toBeNull()
  })

  it("#given an unknown tier name #when parsed #then returns null", () => {
    //#given / #when
    const result = parseTierReference("tier:unknown")

    //#then
    expect(result).toBeNull()
  })

  it("#given undefined input #when parsed #then returns null", () => {
    //#given / #when
    const result = parseTierReference(undefined)

    //#then
    expect(result).toBeNull()
  })
})

describe("TIER_SPECS", () => {
  it("#given the registry #when iterated #then contains all 5 tiers", () => {
    //#then
    expect(TIER_NAMES).toContain("free")
    expect(TIER_NAMES).toContain("fast")
    expect(TIER_NAMES).toContain("standard")
    expect(TIER_NAMES).toContain("premium")
    expect(TIER_NAMES).toContain("frontier")
    expect(TIER_NAMES).toHaveLength(5)
  })

  it("#given the registry #when each spec is examined #then every spec has required fields", () => {
    //#then
    for (const [name, spec] of Object.entries(TIER_SPECS)) {
      expect(spec.name).toBe(name)
      expect(spec.providerPriority).toBeInstanceOf(Array)
      expect(spec.providerPriority.length).toBeGreaterThan(0)
      expect(spec.modelPattern).toBeInstanceOf(RegExp)
      expect(spec.staticFallback).toBeInstanceOf(Array)
      expect(spec.staticFallback.length).toBeGreaterThan(0)
    }
  })
})
