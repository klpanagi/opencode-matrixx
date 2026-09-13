import { describe, expect, test } from "bun:test"
import { applyActivePreset, resolvePresetModel } from "../../src/config/preset-applier"
import type { MatrixxConfig } from "../../src/config/schema/matrixx-config"
import type { ModelPreset } from "../../src/config/schema/model-presets"

const PRESET: ModelPreset = {
  default_model: "p/default",
  agents: { oracle: { model: "p/oracle", variant: "max" } },
  categories: { "bullet-time": { model: "p/fast" } },
}

function configWith(overrides: Partial<MatrixxConfig> = {}): MatrixxConfig {
  return {
    active_preset: "eco",
    model_presets: { eco: PRESET },
    agents: {
      oracle: {},
      morpheus: { model: "p/explicit" },
    },
    categories: {
      "bullet-time": {},
      source: { model: "p/explicit-cat" },
    },
    ...overrides,
  } as MatrixxConfig
}

describe("resolvePresetModel", () => {
  test("prefers agents entry over categories and default", () => {
    //#given a preset with all three levels for key "x"
    const preset: ModelPreset = {
      default_model: "p/default",
      agents: { x: { model: "p/agent" } },
      categories: { x: { model: "p/cat" } },
    }

    //#when resolved
    //#then the agents entry wins
    expect(resolvePresetModel(preset, "x")).toEqual({ model: "p/agent" })
  })

  test("falls back to categories then default_model", () => {
    //#given keys present at lower levels only
    //#when resolved
    //#then each level is reached in order
    expect(resolvePresetModel(PRESET, "bullet-time")).toEqual({ model: "p/fast" })
    expect(resolvePresetModel(PRESET, "unknown-key")).toEqual({ model: "p/default" })
  })

  test("returns undefined when nothing matches", () => {
    //#given a preset without default_model
    //#when resolved for an unknown key
    //#then undefined
    expect(resolvePresetModel({ agents: {} }, "nope")).toBeUndefined()
  })
})

describe("applyActivePreset", () => {
  test("fills missing models, preserves explicit ones", () => {
    //#given a config with mixed explicit and empty entries
    const config = configWith()

    //#when the preset is applied
    const result = applyActivePreset(config)

    //#then empty entries are filled, explicit ones untouched
    expect(result.agents?.oracle?.model).toBe("p/oracle")
    expect(result.agents?.oracle?.variant).toBe("max")
    expect(result.agents?.morpheus?.model).toBe("p/explicit")
    expect(result.categories?.["bullet-time"]?.model).toBe("p/fast")
    expect(result.categories?.source?.model).toBe("p/explicit-cat")
  })

  test("falls back to default_model for entries with no named assignment", () => {
    //#given an agent with no preset assignment
    const config = configWith({ agents: { lonely: {} } } as Partial<MatrixxConfig>)

    //#when applied
    const result = applyActivePreset(config)

    //#then default_model fills it
    expect(result.agents?.lonely?.model).toBe("p/default")
  })

  test("does not mutate the input config", () => {
    //#given a config object
    const config = configWith()

    //#when applied
    const result = applyActivePreset(config)

    //#then input is unchanged and result is a new object
    expect(result).not.toBe(config)
    expect(config.agents?.oracle?.model).toBeUndefined()
    expect(result.agents?.oracle?.model).toBe("p/oracle")
  })

  test("returns config unchanged when no active_preset", () => {
    //#given a config without active_preset
    const config = configWith({ active_preset: undefined })

    //#when applied
    //#then same reference back
    expect(applyActivePreset(config)).toBe(config)
  })

  test("returns config unchanged for unknown preset name", () => {
    //#given an active_preset with no matching entry
    const config = configWith({ active_preset: "missing" })

    //#when applied
    //#then same reference back (error is logged, not thrown)
    expect(applyActivePreset(config)).toBe(config)
  })

  test("explicit presetName argument overrides config.active_preset", () => {
    //#given a config pointing at eco plus a second preset
    const config = configWith({
      model_presets: { eco: PRESET, other: { default_model: "p/other" } },
    })

    //#when applied with an explicit name
    const result = applyActivePreset(config, "other")

    //#then the named preset is used
    expect(result.agents?.oracle?.model).toBe("p/other")
  })
})
