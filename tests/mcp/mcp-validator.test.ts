import { describe, expect, test } from "bun:test"
import { validateWebsearchConfig } from "../../src/mcp/mcp-validator"

describe("validateWebsearchConfig", () => {
  const originalTavily = process.env.TAVILY_API_KEY

  test("returns ok when no config provided (defaults to exa)", () => {
    //#given - no config, no key
    delete process.env.TAVILY_API_KEY

    //#when
    const result = validateWebsearchConfig()

    //#then
    expect(result.ok).toBe(true)
  })

  test("returns ok when provider is exa", () => {
    //#given
    delete process.env.TAVILY_API_KEY

    //#when
    const result = validateWebsearchConfig({ provider: "exa" })

    //#then
    expect(result.ok).toBe(true)
  })

  test("returns ok when provider is tavily and TAVILY_API_KEY present", () => {
    //#given
    process.env.TAVILY_API_KEY = "test-tavily-key"

    //#when
    const result = validateWebsearchConfig({ provider: "tavily" })

    //#then
    expect(result.ok).toBe(true)
  })

  test("returns failure when provider is tavily and TAVILY_API_KEY missing", () => {
    //#given
    delete process.env.TAVILY_API_KEY

    //#when
    const result = validateWebsearchConfig({ provider: "tavily" })

    //#then
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("TAVILY_API_KEY")
    }
  })

  test("does not throw when tavily configured without key", () => {
    //#given
    delete process.env.TAVILY_API_KEY

    //#when / #then
    expect(() => validateWebsearchConfig({ provider: "tavily" })).not.toThrow()
  })

  test("restores env after tests", () => {
    //#then - cleanup
    if (originalTavily === undefined) {
      delete process.env.TAVILY_API_KEY
    } else {
      process.env.TAVILY_API_KEY = originalTavily
    }
    expect(true).toBe(true)
  })
})
