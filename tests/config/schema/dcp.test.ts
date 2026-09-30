/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { BUILTIN_DCP_PROFILES, DcpCompressOverrideSchema } from "../../../src/config/schema/dcp"

describe("BUILTIN_DCP_PROFILES.brutal", () => {
  test("nudges every 2 turns with strong force", () => {
    //#given
    const compress = BUILTIN_DCP_PROFILES.brutal.compress

    //#when
    const { nudgeFrequency, iterationNudgeThreshold, nudgeForce } = compress

    //#then
    // Pinned exactly, not as a lower bound: a bound is what previously let the
    // cadence drift from 3 to 2 without this test failing.
    expect(nudgeFrequency).toBe(2)
    expect(iterationNudgeThreshold).toBe(6)
    expect(nudgeForce).toBe("strong")
  })

  test("carries no builtin per-model context limits", () => {
    //#given
    const compress = BUILTIN_DCP_PROFILES.brutal.compress

    //#then
    // Keyed on absence rather than `toBeUndefined`: the preset is a `const`
    // literal, so the keys genuinely do not exist on its type.
    expect("modelMaxLimits" in compress).toBe(false)
    expect("modelMinLimits" in compress).toBe(false)
  })
})

describe("DcpCompressOverrideSchema model limits", () => {
  test("accepts provider/model keyed percent and number values", () => {
    //#given
    const input = {
      modelMaxLimits: { "deepseek/deepseek-v4.1-flash": "95%" },
      modelMinLimits: { "deepseek/deepseek-v4.1-flash": 90 },
    }

    //#when
    const parsed = DcpCompressOverrideSchema.safeParse(input)

    //#then
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.modelMaxLimits).toEqual({ "deepseek/deepseek-v4.1-flash": "95%" })
    expect(parsed.success && parsed.data.modelMinLimits).toEqual({ "deepseek/deepseek-v4.1-flash": 90 })
  })

  test("rejects a key without provider/model shape", () => {
    //#given
    const input = { modelMaxLimits: { "no-slash": "95%" } }

    //#when
    const parsed = DcpCompressOverrideSchema.safeParse(input)

    //#then
    expect(parsed.success).toBe(false)
  })
})
