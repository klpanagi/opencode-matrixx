import { describe, expect, test } from "bun:test"
import {
  ActivePresetSchema,
  ModelPresetEntrySchema,
  ModelPresetSchema,
  ModelPresetsSchema,
} from "../../src/config/schema/model-presets"

describe("ModelPresetEntrySchema", () => {
  test("accepts provider/model with optional variant", () => {
    //#given a valid entry
    const entry = { model: "anthropic/claude-opus-4-6", variant: "max" }

    //#when parsed
    const result = ModelPresetEntrySchema.safeParse(entry)

    //#then it succeeds
    expect(result.success).toBe(true)
  })

  test("rejects model without provider slash", () => {
    //#given an entry with a bare model name
    const entry = { model: "no-slash" }

    //#when parsed
    const result = ModelPresetEntrySchema.safeParse(entry)

    //#then it fails with the format message
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Must be <provider>/<model>")
    }
  })

  test("rejects empty provider or model parts", () => {
    //#given entries with empty segments
    //#when parsed
    //#then both fail
    expect(ModelPresetEntrySchema.safeParse({ model: "/model" }).success).toBe(false)
    expect(ModelPresetEntrySchema.safeParse({ model: "provider/" }).success).toBe(false)
    expect(ModelPresetEntrySchema.safeParse({ model: "a/b/c" }).success).toBe(false)
  })
})

describe("ModelPresetSchema", () => {
  test("accepts full preset with default, agents, categories", () => {
    //#given a complete preset
    const preset = {
      default_model: "byteplus-plan/deepseek-v4-flash",
      agents: { oracle: { model: "byteplus-plan/deepseek-v3" } },
      categories: { "bullet-time": { model: "byteplus-plan/deepseek-v4-flash" } },
    }

    //#when parsed
    const result = ModelPresetSchema.safeParse(preset)

    //#then it succeeds
    expect(result.success).toBe(true)
  })

  test("accepts empty preset object", () => {
    //#given an empty preset
    //#when parsed
    //#then it succeeds (all fields optional)
    expect(ModelPresetSchema.safeParse({}).success).toBe(true)
  })

  test("rejects invalid default_model format", () => {
    //#given a preset with a malformed default
    //#when parsed
    //#then it fails
    expect(ModelPresetSchema.safeParse({ default_model: "bare" }).success).toBe(false)
  })

  test("rejects unknown nested tier-style fields", () => {
    //#given a preset smuggling a tier alias
    //#when parsed
    //#then the model format check rejects it
    expect(
      ModelPresetSchema.safeParse({ agents: { oracle: { model: "tier:fast" } } }).success,
    ).toBe(false)
  })
})

describe("ModelPresetsSchema", () => {
  test("accepts a map of named presets", () => {
    //#given two named presets
    const presets = {
      eco: { default_model: "byteplus-plan/deepseek-v4-flash" },
      flagship: { default_model: "anthropic/claude-opus-4-6" },
    }

    //#when parsed
    const result = ModelPresetsSchema.safeParse(presets)

    //#then it succeeds
    expect(result.success).toBe(true)
  })
})

describe("ActivePresetSchema", () => {
  test("accepts any non-empty name", () => {
    //#given a preset name
    //#when parsed
    //#then it succeeds
    expect(ActivePresetSchema.safeParse("eco").success).toBe(true)
  })

  test("rejects empty name", () => {
    //#given an empty name
    //#when parsed
    //#then it fails
    expect(ActivePresetSchema.safeParse("").success).toBe(false)
  })
})
