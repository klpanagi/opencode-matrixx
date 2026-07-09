import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createBuiltinMcps } from "./index"

describe("createBuiltinMcps", () => {
  test("should return all MCPs when disabled_mcps is empty", () => {
    // given
    const disabledMcps: string[] = []

    // when
    const result = createBuiltinMcps(disabledMcps)

    // then
    expect(result).toHaveProperty("websearch")
    expect(result).toHaveProperty("context7")
    expect(result).toHaveProperty("grep_app")
    expect(result).toHaveProperty("document_reader")
    expect(Object.keys(result)).toHaveLength(4)
  })

  test("should filter out disabled built-in MCPs", () => {
    // given
    const disabledMcps = ["context7"]

    // when
    const result = createBuiltinMcps(disabledMcps)

    // then
    expect(result).toHaveProperty("websearch")
    expect(result).not.toHaveProperty("context7")
    expect(result).toHaveProperty("grep_app")
    expect(result).toHaveProperty("document_reader")
    expect(Object.keys(result)).toHaveLength(3)
  })

  test("should filter out all built-in MCPs when all disabled", () => {
    // given
    const disabledMcps = ["websearch", "context7", "grep_app", "document_reader"]

    // when
    const result = createBuiltinMcps(disabledMcps)

    // then
    expect(result).not.toHaveProperty("websearch")
    expect(result).not.toHaveProperty("context7")
    expect(result).not.toHaveProperty("grep_app")
    expect(result).not.toHaveProperty("document_reader")
    expect(Object.keys(result)).toHaveLength(0)
  })

  test("should ignore custom MCP names in disabled_mcps", () => {
    // given
    const disabledMcps = ["context7", "playwright", "custom"]

    // when
    const result = createBuiltinMcps(disabledMcps)

    // then
    expect(result).toHaveProperty("websearch")
    expect(result).not.toHaveProperty("context7")
    expect(result).toHaveProperty("grep_app")
    expect(result).toHaveProperty("document_reader")
    expect(Object.keys(result)).toHaveLength(3)
  })

  test("should handle empty disabled_mcps by default", () => {
    // given
    // when
    const result = createBuiltinMcps()

    // then
    expect(result).toHaveProperty("websearch")
    expect(result).toHaveProperty("context7")
    expect(result).toHaveProperty("grep_app")
    expect(result).toHaveProperty("document_reader")
    expect(Object.keys(result)).toHaveLength(4)
  })

  test("should only filter built-in MCPs, ignoring unknown names", () => {
    // given
    const disabledMcps = ["playwright", "sqlite", "unknown-mcp"]

    // when
    const result = createBuiltinMcps(disabledMcps)

    // then
    expect(result).toHaveProperty("websearch")
    expect(result).toHaveProperty("context7")
    expect(result).toHaveProperty("grep_app")
    expect(result).toHaveProperty("document_reader")
    expect(Object.keys(result)).toHaveLength(4)
  })

  test("should not throw when websearch disabled even if tavily configured without API key", () => {
    // given
    const originalTavilyKey = process.env.TAVILY_API_KEY
    delete process.env.TAVILY_API_KEY
    const disabledMcps = ["websearch"]
    const config = { websearch: { provider: "tavily" as const } }

    try {
      // when
      const createMcps = () => createBuiltinMcps(disabledMcps, config)

      // then
      expect(createMcps).not.toThrow()
      const result = createMcps()
      expect(result).not.toHaveProperty("websearch")
    } finally {
      if (originalTavilyKey) process.env.TAVILY_API_KEY = originalTavilyKey
    }
  })
})

describe("lazy websearch config", () => {
  test("websearch config property exists before config is created", () => {
    // given
    const mcps = createBuiltinMcps()

    // then - property exists (enumerable getter) but config is deferred
    expect("websearch" in mcps).toBe(true)
    expect(Object.keys(mcps)).toContain("websearch")

    // when - accessing triggers config creation
    const websearch = mcps.websearch
    expect(websearch).toBeDefined()
    expect(websearch.type).toBe("remote")
  })

  test("disabled websearch never appears in result", () => {
    // given
    const mcps = createBuiltinMcps(["websearch"])

    // then
    expect("websearch" in mcps).toBe(false)
    expect(Object.keys(mcps)).not.toContain("websearch")
  })
})

describe("behavior-level: lazy env-var reading (P1)", () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    originalEnv.EXA_API_KEY = process.env.EXA_API_KEY
    originalEnv.TAVILY_API_KEY = process.env.TAVILY_API_KEY
  })

  afterEach(() => {
    if (originalEnv.EXA_API_KEY !== undefined) {
      process.env.EXA_API_KEY = originalEnv.EXA_API_KEY
    } else {
      delete process.env.EXA_API_KEY
    }
    if (originalEnv.TAVILY_API_KEY !== undefined) {
      process.env.TAVILY_API_KEY = originalEnv.TAVILY_API_KEY
    } else {
      delete process.env.TAVILY_API_KEY
    }
  })

  test("EXA_API_KEY is NOT read during createBuiltinMcps — read lazily on first websearch access", () => {
    //#given
    process.env.EXA_API_KEY = "should-be-read-lazily"

    //#when — construct mcps (env var present)
    const mcps = createBuiltinMcps()

    // Immediately clear env var — if eagerly read, too late
    delete process.env.EXA_API_KEY

    // Access websearch config — triggers lazy factory
    const websearch = mcps.websearch

    //#then — config was built lazily; env var was gone by then
    expect(websearch.url).not.toContain("should-be-read-lazily")
    expect(websearch.url).toBe("https://mcp.exa.ai/mcp?tools=web_search_exa")
  })

  test("TAVILY_API_KEY is NOT read during createBuiltinMcps with tavily config — read lazily", () => {
    //#given
    process.env.TAVILY_API_KEY = "tavily-lazy-test-key"

    //#when — construct mcps with tavily config (env var present)
    const mcps = createBuiltinMcps([], { websearch: { provider: "tavily" } })

    // Immediately clear env var — should NOT have been read yet
    delete process.env.TAVILY_API_KEY

    // Access websearch config — triggers lazy factory
    expect(() => mcps.websearch).toThrow(
      "TAVILY_API_KEY environment variable is required for Tavily provider",
    )
  })

  test("env vars are still read correctly when present at first access time", () => {
    //#given — set env vars before lazy access
    process.env.EXA_API_KEY = "access-time-key"
    const mcps = createBuiltinMcps()

    //#when — env var is present at access time
    const websearch = mcps.websearch

    //#then — config captures the env var value
    expect(websearch.url).toContain("access-time-key")
  })
})
