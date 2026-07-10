import { describe, expect, it } from "bun:test"
import {
  migrateAgentOverride,
  migrateCategoryOverride,
  migrateProfileToTiers,
  modelToTier,
} from "./migrate-profile"
import type { AgentOverrideConfig, CategoryConfig } from "./schema"
import type { MatrixxConfig } from "./schema/matrixx-config"

describe("modelToTier", () => {
  describe("premium tier mappings", () => {
    it("#given claude-opus-4-6 #when mapped #then returns 'premium'", () => {
      //#then
      expect(modelToTier("anthropic/claude-opus-4-6")).toBe("premium")
    })
    it("#given gpt-5.3-codex #when mapped #then returns 'premium'", () => {
      //#then
      expect(modelToTier("openai/gpt-5.3-codex")).toBe("premium")
    })
    it("#given opencode-go/kimi-k2.6 #when mapped #then returns 'premium'", () => {
      //#then
      expect(modelToTier("opencode-go/kimi-k2.6")).toBe("premium")
    })
    it("#given xiaomi-token-plan-ams/mimo-v2.5-pro #when mapped #then returns 'premium'", () => {
      //#then
      expect(modelToTier("xiaomi-token-plan-ams/mimo-v2.5-pro")).toBe("premium")
    })
  })

  describe("standard tier mappings", () => {
    it("#given claude-sonnet-4-6 #when mapped #then returns 'standard'", () => {
      //#then
      expect(modelToTier("anthropic/claude-sonnet-4-6")).toBe("standard")
    })
    it("#given gpt-5.2 #when mapped #then returns 'standard'", () => {
      //#then
      expect(modelToTier("openai/gpt-5.2")).toBe("standard")
    })
  })

  describe("fast tier mappings", () => {
    it("#given claude-haiku-4-5 #when mapped #then returns 'fast'", () => {
      //#then
      expect(modelToTier("anthropic/claude-haiku-4-5")).toBe("fast")
    })
    it("#given opencode-go/deepseek-v4-flash #when mapped #then returns 'fast'", () => {
      //#then
      expect(modelToTier("opencode-go/deepseek-v4-flash")).toBe("fast")
    })
    it("#given opencode-go/mimo-v2.5 #when mapped #then returns 'fast'", () => {
      //#then
      expect(modelToTier("opencode-go/mimo-v2.5")).toBe("fast")
    })
  })

  describe("free tier mappings", () => {
    it("#given opencode/kimi-k2.5-free #when mapped #then returns 'free'", () => {
      //#then
      expect(modelToTier("opencode/kimi-k2.5-free")).toBe("free")
    })
    it("#given xai/grok-code-fast-1 #when mapped #then returns 'free'", () => {
      //#then
      expect(modelToTier("xai/grok-code-fast-1")).toBe("free")
    })
    it("#given minimax-m2.5-free #when mapped #then returns 'free'", () => {
      //#then
      expect(modelToTier("minimax-m2.5-free")).toBe("free")
    })
  })

  describe("unknown model fallback", () => {
    it("#given an unrecognized model #when mapped #then defaults to 'standard'", () => {
      //#then
      expect(modelToTier("unknown-provider/some-model")).toBe("standard")
    })
  })
})

describe("migrateAgentOverride", () => {
  it("#given an entry with model='claude-opus-4-6' #when migrated #then model is removed and tier='premium' is set", () => {
    //#given
    const entry: AgentOverrideConfig = { model: "anthropic/claude-opus-4-6" }

    //#when
    const result = migrateAgentOverride(entry)

    //#then
    expect(result?.model).toBeUndefined()
    expect(result?.tier).toBe("premium")
  })

  it("#given an entry with model and other fields (fallbackChain) #when migrated #then model is replaced with tier and other fields are preserved", () => {
    //#given
    const entry: AgentOverrideConfig = {
      model: "opencode-go/deepseek-v4-flash",
      fallbackChain: [{ providers: ["opencode-go"], model: "opencode-go/mimo-v2.5" }],
    }

    //#when
    const result = migrateAgentOverride(entry)

    //#then
    expect(result?.model).toBeUndefined()
    expect(result?.tier).toBe("fast")
    expect(result?.fallbackChain).toEqual([{ providers: ["opencode-go"], model: "opencode-go/mimo-v2.5" }])
  })

  it("#given an entry without a model field #when migrated #then the entry is returned unchanged", () => {
    //#given
    const entry: AgentOverrideConfig = { temperature: 0.5 }

    //#when
    const result = migrateAgentOverride(entry)

    //#then
    expect(result).toEqual({ temperature: 0.5 })
  })

  it("#given undefined #when migrated #then returns undefined", () => {
    //#when
    const result = migrateAgentOverride(undefined)

    //#then
    expect(result).toBeUndefined()
  })
})

describe("migrateCategoryOverride", () => {
  it("#given a category with model='claude-sonnet-4-6' #when migrated #then model is removed and tier='standard' is set", () => {
    //#given
    const entry: CategoryConfig = { model: "anthropic/claude-sonnet-4-6" }

    //#when
    const result = migrateCategoryOverride(entry)

    //#then
    expect(result?.model).toBeUndefined()
    expect(result?.tier).toBe("standard")
  })

  it("#given a category with model and variant #when migrated #then both are preserved and tier is added", () => {
    //#given
    const entry: CategoryConfig = { model: "anthropic/claude-opus-4-6", variant: "max" }

    //#when
    const result = migrateCategoryOverride(entry)

    //#then
    expect(result?.tier).toBe("premium")
    expect(result?.variant).toBe("max")
  })

  it("#given undefined #when migrated #then returns undefined", () => {
    //#when
    const result = migrateCategoryOverride(undefined)

    //#then
    expect(result).toBeUndefined()
  })
})

describe("migrateProfileToTiers", () => {
  describe("go profile", () => {
    it("#given 'go' #when migrated #then GLM-5.1 agents become 'premium' tier", () => {
      //#when
      const result = migrateProfileToTiers("go")

      //#then
      expect(result.agents?.morpheus?.tier).toBe("premium")
      expect(result.agents?.oracle?.tier).toBe("premium")
      expect(result.agents?.seraph?.tier).toBe("premium")
    })

    it("#given 'go' #when migrated #then deepseek-v4-flash agents become 'fast' tier", () => {
      //#when
      const result = migrateProfileToTiers("go")

      //#then
      expect(result.agents?.operator?.tier).toBe("fast")
      expect(result.agents?.trinity?.tier).toBe("fast")
      expect(result.agents?.construct?.tier).toBe("fast")
    })

    it("#given 'go' #when migrated #then no agent retains a hardcoded model string", () => {
      //#when
      const result = migrateProfileToTiers("go")

      //#then
      for (const [name, entry] of Object.entries(result.agents ?? {})) {
        expect({ name, model: entry.model }).toEqual({ name, model: undefined })
        expect(entry.tier).toBeDefined()
      }
    })

    it("#given 'go' #when migrated #then no category retains a hardcoded model string", () => {
      //#when
      const result = migrateProfileToTiers("go")

      //#then
      for (const [name, entry] of Object.entries(result.categories ?? {})) {
        expect({ name, model: entry.model }).toEqual({ name, model: undefined })
        expect(entry.tier).toBeDefined()
      }
    })
  })

  describe("balanced profile (non-deprecated)", () => {
    it("#given 'balanced' #when migrated #then opus becomes 'premium', haiku becomes 'fast'", () => {
      //#when
      const result = migrateProfileToTiers("balanced")

      //#then
      expect(result.agents?.morpheus?.tier).toBe("premium")
      expect(result.agents?.trinity?.tier).toBe("fast")
    })

    it("#given 'balanced' #when migrated #then no hardcoded model strings remain in agents", () => {
      //#when
      const result = migrateProfileToTiers("balanced")

      //#then
      for (const entry of Object.values(result.agents ?? {})) {
        expect(entry.model).toBeUndefined()
        expect(entry.tier).toBeDefined()
      }
    })
  })

  describe("go-duo profile (preserves fallbackChain)", () => {
    it("#given 'go-duo' #when migrated #then each agent retains its fallbackChain field", () => {
      //#when
      const result = migrateProfileToTiers("go-duo")

      //#then
      for (const [name, entry] of Object.entries(result.agents ?? {})) {
        const chain = entry.fallbackChain
        expect({ name, hasChain: chain?.length ?? 0 }).toEqual({ name, hasChain: expect.any(Number) })
        if (chain) {
          expect(chain.length).toBeGreaterThan(0)
        }
      }
    })

    it("#given 'go-duo' #when migrated #then no hardcoded model strings remain", () => {
      //#when
      const result = migrateProfileToTiers("go-duo")

      //#then
      for (const entry of Object.values(result.agents ?? {})) {
        expect(entry.model).toBeUndefined()
        expect(entry.tier).toBeDefined()
      }
    })
  })

  describe("invalid profile", () => {
    it("#given an invalid profile name #when migrated #then throws an error", () => {
      //#then
      expect(() =>
        migrateProfileToTiers("nonexistent" as never),
      ).toThrow()
    })
  })

  describe("output is a valid MatrixxConfig", () => {
    it("#given any profile #when migrated #then the result is a Partial<MatrixxConfig> with agents and/or categories blocks", () => {
      //#when
      const result: Partial<MatrixxConfig> = migrateProfileToTiers("free")

      //#then
      expect(result.agents).toBeDefined()
      expect(result.categories).toBeDefined()
    })
  })
})
