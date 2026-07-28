import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import * as connectedProvidersCache from "../../src/shared/connected-providers-cache"
import * as logger from "../../src/shared/logger"
import { normalizeModel, resolveModelPipeline, type ModelResolutionRequest, type ModelResolutionProvenance, type ModelResolutionResult } from "../../src/shared/model-resolution-pipeline"

describe("normalizeModel", () => {
  test("trims whitespace", () => {
    expect(normalizeModel("  abc  ")).toBe("abc")
  })

  test("returns undefined for empty string", () => {
    expect(normalizeModel("")).toBeUndefined()
  })

  test("returns undefined for whitespace-only", () => {
    expect(normalizeModel("   ")).toBeUndefined()
  })

  test("returns undefined for undefined", () => {
    expect(normalizeModel(undefined)).toBeUndefined()
  })
})

describe("resolveModelPipeline", () => {
  let logSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    logSpy = spyOn(logger, "log")
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  function buildRequest(overrides: Partial<ModelResolutionRequest> = {}): ModelResolutionRequest {
    return {
      intent: {},
      constraints: { availableModels: new Set() },
      policy: {},
      ...overrides,
    }
  }

  describe("Step 1: Global Override", () => {
    test("global override takes priority over everything", () => {
      const result = resolveModelPipeline(buildRequest({
        intent: { globalOverrideModel: "opencode/glm-4.7-free", uiSelectedModel: "anthropic/claude-opus-4-6", userModel: "openai/gpt-5.2" },
      }))
      expect(result?.model).toBe("opencode/glm-4.7-free")
      expect(result?.provenance).toBe("override")
    })
  })

  describe("Step 2: UI Selection", () => {
    test("returns uiSelectedModel", () => {
      const result = resolveModelPipeline(buildRequest({
        intent: { uiSelectedModel: "opencode/glm-4.7-free", userModel: "anthropic/claude-opus-4-6" },
        constraints: { availableModels: new Set() },
        policy: { fallbackChain: [{ providers: ["anthropic", "github-copilot"], model: "claude-opus-4-6" }], systemDefaultModel: "google/gemini-3-pro" },
      }))
      expect(result?.model).toBe("opencode/glm-4.7-free")
      expect(result?.provenance).toBe("override")
      expect(logSpy).toHaveBeenCalledWith("Model resolved via UI selection", { model: "opencode/glm-4.7-free" })
    })

    test("whitespace-only falls through", () => {
      const result = resolveModelPipeline(buildRequest({
        intent: { uiSelectedModel: "   ", userModel: "anthropic/claude-opus-4-6" },
        constraints: { availableModels: new Set(["anthropic/claude-opus-4-6"]) },
        policy: { systemDefaultModel: "google/gemini-3-pro" },
      }))
      expect(result?.model).toBe("anthropic/claude-opus-4-6")
    })
  })

  describe("Step 3: Config Override", () => {
    test("returns userModel with override provenance", () => {
      const result = resolveModelPipeline(buildRequest({
        intent: { userModel: "anthropic/claude-opus-4-6" },
        constraints: { availableModels: new Set(["anthropic/claude-opus-4-6"]) },
        policy: { fallbackChain: [{ providers: ["anthropic", "github-copilot"], model: "claude-opus-4-6" }], systemDefaultModel: "google/gemini-3-pro" },
      }))
      expect(result?.model).toBe("anthropic/claude-opus-4-6")
      expect(result?.provenance).toBe("override")
    })

    test("whitespace-only userModel is treated as not provided", () => {
      const result = resolveModelPipeline(buildRequest({
        intent: { userModel: "   " },
        constraints: { availableModels: new Set(["anthropic/claude-opus-4-6"]) },
        policy: { fallbackChain: [{ providers: ["anthropic"], model: "claude-opus-4-6" }], systemDefaultModel: "google/gemini-3-pro" },
      }))
      expect(result?.provenance).not.toBe("override")
    })
  })

  describe("Step 4: Provider fallback chain", () => {
    test("tries providers in order", () => {
      const result = resolveModelPipeline(buildRequest({
        constraints: { availableModels: new Set(["github-copilot/claude-opus-4-6-preview", "opencode/claude-opus-4-7"]) },
        policy: { fallbackChain: [{ providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-6" }], systemDefaultModel: "google/gemini-3-pro" },
      }))
      expect(result?.model).toBe("github-copilot/claude-opus-4-6-preview")
      expect(result?.provenance).toBe("provider-fallback")
    })

    test("cross-provider fuzzy match", () => {
      const result = resolveModelPipeline(buildRequest({
        constraints: { availableModels: new Set(["opencode/glm-4.7"]) },
        policy: { fallbackChain: [{ providers: ["zai-coding-plan"], model: "glm-4.7", variant: "high" }], systemDefaultModel: "google/gemini-3-pro" },
      }))
      expect(result?.model).toBe("opencode/glm-4.7")
      expect(result?.variant).toBe("high")
      expect(result?.provenance).toBe("provider-fallback")
    })

    test("skips fallback chain when not provided", () => {
      const result = resolveModelPipeline(buildRequest({
        constraints: { availableModels: new Set(["anthropic/claude-opus-4-6"]) },
        policy: { systemDefaultModel: "google/gemini-3-pro" },
      }))
      expect(result?.provenance).toBe("system-default")
    })
  })

  describe("Multi-entry fallbackChain", () => {
    test("resolves second entry when first unavailable", () => {
      const result = resolveModelPipeline(buildRequest({
        constraints: { availableModels: new Set(["anthropic/claude-opus-4-6"]) },
        policy: {
          fallbackChain: [
            { providers: ["openai"], model: "gpt-5.2" },
            { providers: ["anthropic"], model: "claude-opus-4-6" },
          ],
          systemDefaultModel: "system/default",
        },
      }))
      expect(result?.model).toBe("anthropic/claude-opus-4-6")
      expect(result?.provenance).toBe("provider-fallback")
    })
  })

  describe("System default fallback", () => {
    test("returns system default when no match in fallback", () => {
      const result = resolveModelPipeline(buildRequest({
        constraints: { availableModels: new Set(["openai/gpt-5.2"]) },
        policy: { fallbackChain: [{ providers: ["anthropic"], model: "nonexistent" }], systemDefaultModel: "google/gemini-3-pro" },
      }))
      expect(result?.model).toBe("google/gemini-3-pro")
      expect(result?.provenance).toBe("system-default")
    })

    test("returns undefined when no system default and no match", () => {
      const result = resolveModelPipeline(buildRequest({
        constraints: { availableModels: new Set(["openai/gpt-5.2"]) },
        policy: { fallbackChain: [{ providers: ["anthropic"], model: "nonexistent" }], systemDefaultModel: undefined },
      }))
      expect(result).toBeUndefined()
    })

    test("uses connected provider cache when availableModels empty", () => {
      const cacheSpy = spyOn(connectedProvidersCache, "readConnectedProvidersCache").mockReturnValue(["openai"])
      const result = resolveModelPipeline({
        intent: {},
        constraints: { availableModels: new Set() },
        policy: { fallbackChain: [{ providers: ["anthropic", "openai"], model: "claude-opus-4-6" }], systemDefaultModel: "google/gemini-3-pro" },
      })
      expect(result?.model).toBe("openai/claude-opus-4-6")
      expect(result?.provenance).toBe("provider-fallback")
      cacheSpy.mockRestore()
    })

    test("falls through when no provider in fallback is connected", () => {
      const cacheSpy = spyOn(connectedProvidersCache, "readConnectedProvidersCache").mockReturnValue(["quotio"])
      const result = resolveModelPipeline({
        intent: {},
        constraints: { availableModels: new Set() },
        policy: { fallbackChain: [{ providers: ["anthropic", "opencode"], model: "claude-haiku-4-5" }], systemDefaultModel: "quotio/claude-opus-4-6" },
      })
      expect(result?.model).toBe("quotio/claude-opus-4-6")
      expect(result?.provenance).toBe("system-default")
      cacheSpy.mockRestore()
    })
  })

  describe("categoryDefaultModel", () => {
    test("fuzzy matches categoryDefaultModel", () => {
      const result = resolveModelPipeline(buildRequest({
        intent: { categoryDefaultModel: "google/gemini-3-pro" },
        constraints: { availableModels: new Set(["google/gemini-3-pro-preview"]) },
        policy: { systemDefaultModel: "anthropic/claude-sonnet-4-5" },
      }))
      expect(result?.model).toBe("google/gemini-3-pro-preview")
      expect(result?.provenance).toBe("category-default")
    })

    test("falls through to fallbackChain when no match", () => {
      const result = resolveModelPipeline(buildRequest({
        intent: { categoryDefaultModel: "google/gemini-3-pro" },
        constraints: { availableModels: new Set(["anthropic/claude-opus-4-6"]) },
        policy: { fallbackChain: [{ providers: ["anthropic"], model: "claude-opus-4-6" }], systemDefaultModel: "system/default" },
      }))
      expect(result?.model).toBe("anthropic/claude-opus-4-6")
      expect(result?.provenance).toBe("provider-fallback")
    })

    test("works when availableModels empty but connected provider exists", () => {
      const cacheSpy = spyOn(connectedProvidersCache, "readConnectedProvidersCache").mockReturnValue(["google"])
      const result = resolveModelPipeline(buildRequest({
        intent: { categoryDefaultModel: "google/gemini-3-pro" },
        constraints: { availableModels: new Set() },
        policy: { systemDefaultModel: "anthropic/claude-sonnet-4-5" },
      }))
      expect(result?.model).toBe("google/gemini-3-pro")
      expect(result?.provenance).toBe("category-default")
      cacheSpy.mockRestore()
    })
  })
})
