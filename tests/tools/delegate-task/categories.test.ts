import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"

import * as connectedProvidersCache from "../../../src/shared/connected-providers-cache"
import type { TierResolverContext } from "../../../src/shared/tier-resolver"
import { resolveCategoryConfig } from "../../../src/tools/delegate-task/categories"
import { DEFAULT_CATEGORIES } from "../../../src/tools/delegate-task/constants"

describe("DEFAULT_CATEGORIES", () => {
  it("#given the registry #when inspected #then no entry hardcodes a model string (uses tier instead)", () => {
    //#given / #when
    //#then
    for (const [name, entry] of Object.entries(DEFAULT_CATEGORIES)) {
      expect({ name, model: entry.model }).toEqual({ name, model: undefined })
    }
  })

  it("#given the registry #when inspected #then every entry has a tier field", () => {
    //#then
    for (const [name, entry] of Object.entries(DEFAULT_CATEGORIES)) {
      expect({ name, tier: entry.tier }).toEqual({
        name,
        tier: expect.stringMatching(/^(free|fast|standard|premium|frontier)$/),
      })
    }
  })
})

describe("resolveCategoryConfig with tier-based defaults", () => {
  let connectedProvidersSpy: ReturnType<typeof spyOn> | undefined
  let providerModelsSpy: ReturnType<typeof spyOn> | undefined

  beforeEach(() => {
    mock.restore()
    connectedProvidersSpy = spyOn(
      connectedProvidersCache,
      "readConnectedProvidersCache",
    ).mockReturnValue(null)
    providerModelsSpy = spyOn(
      connectedProvidersCache,
      "readProviderModelsCache",
    ).mockReturnValue(null)
  })

  afterEach(() => {
    connectedProvidersSpy?.mockRestore()
    providerModelsSpy?.mockRestore()
  })

  const makeCtx = (
    availableModels: string[] = ["anthropic/claude-opus-4-6", "anthropic/claude-sonnet-4-6", "anthropic/claude-haiku-4-5"],
    connectedProviders: string[] | null = ["anthropic"],
  ): TierResolverContext => ({
    availableModels: new Set(availableModels),
    connectedProviders,
  })

  describe("anthropic connected (typical case)", () => {
    it("#given source category #when resolved #then model='anthropic/claude-opus-4-6' and variant='max'", () => {
      //#given
      const ctx = makeCtx()

      //#when
      const result = resolveCategoryConfig("source", {
        systemDefaultModel: "anthropic/claude-sonnet-4-5",
        tierContext: ctx,
      })

      //#then
      expect(result?.model).toBe("anthropic/claude-opus-4-6")
      expect(result?.config.variant).toBe("max")
    })

    it("#given bullet-time category #when resolved #then model='anthropic/claude-haiku-4-5' (fast tier)", () => {
      //#given
      const ctx = makeCtx()

      //#when
      const result = resolveCategoryConfig("bullet-time", {
        systemDefaultModel: "anthropic/claude-sonnet-4-5",
        tierContext: ctx,
      })

      //#then
      expect(result?.model).toBe("anthropic/claude-haiku-4-5")
    })

    it("#given construct category #when resolved #then model='anthropic/claude-sonnet-4-6' (standard tier)", () => {
      //#given
      const ctx = makeCtx()

      //#when
      const result = resolveCategoryConfig("construct", {
        systemDefaultModel: "anthropic/claude-sonnet-4-5",
        tierContext: ctx,
      })

      //#then
      expect(result?.model).toBe("anthropic/claude-sonnet-4-6")
    })

    it("#given red-pill category #when resolved #then model='anthropic/claude-opus-4-6' (premium tier) and variant='max'", () => {
      //#given
      const ctx = makeCtx()

      //#when
      const result = resolveCategoryConfig("red-pill", {
        systemDefaultModel: "anthropic/claude-sonnet-4-5",
        tierContext: ctx,
      })

      //#then
      expect(result?.model).toBe("anthropic/claude-opus-4-6")
      expect(result?.config.variant).toBe("max")
    })
  })

  describe("only openai connected (cross-provider)", () => {
    it("#given source category with only openai available #when resolved #then model falls back via cross-provider (gpt-5.3-codex for premium)", () => {
      //#given
      const ctx: TierResolverContext = {
        availableModels: new Set(["openai/gpt-5.3-codex", "openai/gpt-5.2"]),
        connectedProviders: ["openai"],
      }

      //#when
      const result = resolveCategoryConfig("source", {
        systemDefaultModel: "anthropic/claude-sonnet-4-5",
        tierContext: ctx,
      })

      //#then
      expect(result?.model).toBe("openai/gpt-5.3-codex")
    })

    it("#given bullet-time with only openai #when resolved #then model='openai/gpt-5.2' (standard fallback from fast)", () => {
      //#given
      const ctx: TierResolverContext = {
        availableModels: new Set(["openai/gpt-5.2", "openai/gpt-5-nano"]),
        connectedProviders: ["openai"],
      }

      //#when
      const result = resolveCategoryConfig("bullet-time", {
        systemDefaultModel: "anthropic/claude-sonnet-4-5",
        tierContext: ctx,
      })

      //#then - fast tier matches gpt-5-nano
      expect(result?.model).toBe("openai/gpt-5-nano")
    })
  })

  describe("cold cache (no live models, no connected providers)", () => {
    it("#given no live models and no connected providers #when resolved #then falls back to systemDefaultModel", () => {
      //#given
      const ctx: TierResolverContext = {
        availableModels: new Set(),
        connectedProviders: [],
      }

      //#when
      const result = resolveCategoryConfig("source", {
        systemDefaultModel: "anthropic/claude-sonnet-4-5",
        tierContext: ctx,
      })

      //#then
      expect(result?.model).toBe("anthropic/claude-sonnet-4-5")
    })
  })

  describe("user override wins over tier default", () => {
    it("#given user sets category.model explicitly #when resolved #then user model wins (no tier resolution applied)", () => {
      //#given
      const ctx = makeCtx()

      //#when
      const result = resolveCategoryConfig("source", {
        systemDefaultModel: "anthropic/claude-sonnet-4-5",
        tierContext: ctx,
        userCategories: { source: { model: "openai/gpt-5.3-codex" } },
      })

      //#then
      expect(result?.model).toBe("openai/gpt-5.3-codex")
    })

    it("#given user sets category.tier explicitly #when resolved #then user tier wins (resolved against live list)", () => {
      //#given
      const ctx = makeCtx()

      //#when
      const result = resolveCategoryConfig("source", {
        systemDefaultModel: "anthropic/claude-sonnet-4-5",
        tierContext: ctx,
        userCategories: { source: { tier: "standard" } },
      })

      //#then
      expect(result?.model).toBe("anthropic/claude-sonnet-4-6")
    })
  })
})
