import { describe, expect, it } from "bun:test"

import { expandPreset, PRESET_NAMES } from "./presets"

describe("PRESET_NAMES", () => {
  it("#given the registry #when inspected #then contains the expected tier-based presets", () => {
    //#then
    expect(PRESET_NAMES).toContain("minimal")
    expect(PRESET_NAMES).toContain("balanced")
    expect(PRESET_NAMES).toContain("performance")
    expect(PRESET_NAMES).toContain("frontier")
  })

  it("#given the registry #when iterated #then no preset hardcodes a model string", () => {
    //#then
    for (const name of PRESET_NAMES) {
      const expanded = expandPreset(name)
      for (const [agentName, entry] of Object.entries(expanded.agents ?? {})) {
        expect({ name: agentName, model: entry.model }).toEqual({
          name: agentName,
          model: undefined,
        })
        expect(entry.tier).toBeDefined()
      }
    }
  })
})

describe("expandPreset", () => {
  it("#given 'minimal' #when expanded #then default_tier is 'fast'", () => {
    //#when
    const result = expandPreset("minimal")

    //#then
    expect((result as { default_tier?: string }).default_tier).toBe("fast")
  })

  it("#given 'balanced' #when expanded #then default_tier is 'standard' and reasoning agents get 'premium'", () => {
    //#when
    const result = expandPreset("balanced")

    //#then
    expect((result as { default_tier?: string }).default_tier).toBe("standard")
    expect(result.agents?.morpheus?.tier).toBe("premium")
    expect(result.agents?.oracle?.tier).toBe("premium")
    expect(result.agents?.seraph?.tier).toBe("premium")
    expect(result.agents?.trinity?.tier).toBe("fast")
    expect(result.agents?.operator?.tier).toBe("fast")
  })

  it("#given 'balanced' #when expanded #then reasoning-heavy categories get 'premium' and bullet-time gets 'fast'", () => {
    //#when
    const result = expandPreset("balanced")

    //#then
    expect(result.categories?.source?.tier).toBe("premium")
    expect(result.categories?.["red-pill"]?.tier).toBe("premium")
    expect(result.categories?.["bullet-time"]?.tier).toBe("fast")
    expect(result.categories?.["blue-pill"]?.tier).toBe("standard")
  })

  it("#given 'performance' #when expanded #then default_tier is 'premium' and bullet-time still uses 'fast'", () => {
    //#when
    const result = expandPreset("performance")

    //#then
    expect((result as { default_tier?: string }).default_tier).toBe("premium")
    expect(result.categories?.["bullet-time"]?.tier).toBe("fast")
  })

  it("#given 'frontier' #when expanded #then default_tier is 'frontier' and bullet-time still uses 'fast'", () => {
    //#when
    const result = expandPreset("frontier")

    //#then
    expect((result as { default_tier?: string }).default_tier).toBe("frontier")
    expect(result.categories?.["bullet-time"]?.tier).toBe("fast")
  })

  it("#given any preset #when expanded #then no entry has a hardcoded `model` string (only `tier`)", () => {
    //#then
    for (const name of PRESET_NAMES) {
      const expanded = expandPreset(name)
      for (const [agentName, entry] of Object.entries(expanded.agents ?? {})) {
        expect({
          name: agentName,
          preset: name,
          model: entry.model,
        }).toEqual({
          name: agentName,
          preset: name,
          model: undefined,
        })
      }
      for (const [catName, entry] of Object.entries(expanded.categories ?? {})) {
        expect({
          name: catName,
          preset: name,
          model: entry.model,
        }).toEqual({
          name: catName,
          preset: name,
          model: undefined,
        })
      }
    }
  })
})
