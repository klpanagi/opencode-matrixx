import { describe, expect, test } from "bun:test"
import { MatrixxConfigSchema } from "../../src/config/schema/matrixx-config"
import {
  ComplexityDowngradesSchema,
  ModelFallbackEntrySchema,
} from "../../src/config/schema/model-config"

describe("ModelFallbackEntrySchema", () => {
  test("accepts valid entry with providers and model", () => {
    // #given
    const entry = { providers: ["provider-a", "provider-b"], model: "model-id" }

    // #when
    const result = ModelFallbackEntrySchema.safeParse(entry)

    // #then
    expect(result.success).toBe(true)
  })

  test("rejects empty provider string", () => {
    // #given
    const entry = { providers: [""], model: "model-id" }

    // #when
    const result = ModelFallbackEntrySchema.safeParse(entry)

    // #then
    expect(result.success).toBe(false)
  })

  test("rejects empty model string", () => {
    // #given
    const entry = { providers: ["provider-a"], model: "" }

    // #when
    const result = ModelFallbackEntrySchema.safeParse(entry)

    // #then
    expect(result.success).toBe(false)
  })
})

describe("ComplexityDowngradesSchema", () => {
  test("rejects tier reference value (only provider/model allowed)", () => {
    // #given
    const downgrades = {
      category_a: { "1": "tier:fast" },
    }

    // #when
    const result = ComplexityDowngradesSchema.safeParse(downgrades)

    // #then
    expect(result.success).toBe(false)
  })

  test("accepts provider/model value", () => {
    // #given
    const downgrades = {
      category_a: { "1": "provider-a/model-id" },
    }

    // #when
    const result = ComplexityDowngradesSchema.safeParse(downgrades)

    // #then
    expect(result.success).toBe(true)
  })

  test("rejects invalid downgrade value (neither tier nor provider/model)", () => {
    // #given
    const downgrades = {
      category_a: { "1": "invalid-value" },
    }

    // #when
    const result = ComplexityDowngradesSchema.safeParse(downgrades)

    // #then
    expect(result.success).toBe(false)
  })

  test("rejects tier reference with empty name", () => {
    // #given
    const downgrades = {
      category_a: { "1": "tier:" },
    }

    // #when
    const result = ComplexityDowngradesSchema.safeParse(downgrades)

    // #then
    expect(result.success).toBe(false)
  })
})

describe("MatrixxConfigSchema with new fields", () => {
  test("accepts config with modelRequirements", () => {
    // #given
    const config = {
      modelRequirements: {
        agents: {
          trinity: {
            fallbackChain: [{ providers: ["provider-a"], model: "model-id" }],
          },
        },
        categories: {
          "bullet-time": {
            fallbackChain: [{ providers: ["provider-a"], model: "model-id" }],
          },
        },
      },
    }

    // #when
    const result = MatrixxConfigSchema.safeParse(config)

    // #then
    expect(result.success).toBe(true)
  })

  test("accepts config with complexityDowngrades using provider/model value", () => {
    // #given
    const config = {
      complexityDowngrades: {
        "bullet-time": { "1": "provider-a/model-fast" },
      },
    }

    // #when
    const result = MatrixxConfigSchema.safeParse(config)

    // #then
    expect(result.success).toBe(true)
  })

  test("accepts empty config (all new fields optional)", () => {
    // #given
    const config = {}

    // #when
    const result = MatrixxConfigSchema.safeParse(config)

    // #then
    expect(result.success).toBe(true)
  })
})
